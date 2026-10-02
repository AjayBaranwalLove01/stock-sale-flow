-- 1. Table for sequential invoice numbering per business
CREATE TABLE IF NOT EXISTS public.business_invoice_sequences (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  current_val BIGINT NOT NULL DEFAULT 0,
  prefix TEXT NOT NULL DEFAULT 'INV',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_invoice_sequences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'business_invoice_sequences' AND policyname = 'Authenticated users can select invoice sequences for their business'
  ) THEN
    CREATE POLICY "Authenticated users can select invoice sequences for their business"
    ON public.business_invoice_sequences
    FOR SELECT
    TO authenticated
    USING (business_id = public.current_business_id());
  END IF;
END $$;

GRANT SELECT ON public.business_invoice_sequences TO authenticated;

-- Seed existing sequences for all existing businesses
INSERT INTO public.business_invoice_sequences (business_id, current_val, prefix)
SELECT 
  b.id AS business_id,
  COALESCE(
    (
      SELECT MAX(NULLIF(regexp_replace(s.invoice_no, '\D', '', 'g'), '')::BIGINT)
      FROM public.sales s
      WHERE s.business_id = b.id
    ),
    0
  ) AS current_val,
  COALESCE(bs.invoice_prefix, 'INV') AS prefix
FROM public.businesses b
LEFT JOIN public.business_settings bs ON bs.business_id = b.id
ON CONFLICT (business_id) DO NOTHING;

-- 2. Add access_token to sales for secure sharing without exposing internal IDs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN access_token TEXT;
  END IF;
END $$;

UPDATE public.sales
SET access_token = encode(gen_random_bytes(16), 'hex')
WHERE access_token IS NULL;

ALTER TABLE public.sales ALTER COLUMN access_token SET DEFAULT encode(gen_random_bytes(16), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS sales_access_token_idx ON public.sales(access_token);

-- 3. Database-level uniqueness constraint for invoice numbers within each business
CREATE UNIQUE INDEX IF NOT EXISTS sales_business_invoice_no_idx 
ON public.sales(business_id, invoice_no);

-- 4. Safe concurrency-locked sequence generator
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seq_val BIGINT;
  v_prefix TEXT;
  v_invoice_no TEXT;
  v_start_num INT;
BEGIN
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'Business ID cannot be null for invoice generation';
  END IF;

  -- Ensure sequence record exists for this business
  INSERT INTO public.business_invoice_sequences (business_id, current_val, prefix)
  SELECT 
    p_business_id,
    COALESCE(
      (
        SELECT MAX(NULLIF(regexp_replace(s.invoice_no, '\D', '', 'g'), '')::BIGINT)
        FROM public.sales s
        WHERE s.business_id = p_business_id
      ),
      0
    ),
    COALESCE(
      (SELECT invoice_prefix FROM public.business_settings WHERE business_id = p_business_id),
      'INV'
    )
  ON CONFLICT (business_id) DO NOTHING;

  -- Row-level lock to prevent concurrent collisions
  SELECT current_val, prefix INTO v_seq_val, v_prefix
  FROM public.business_invoice_sequences
  WHERE business_id = p_business_id
  FOR UPDATE;

  SELECT COALESCE(invoice_start_number, 1), COALESCE(invoice_prefix, 'INV')
  INTO v_start_num, v_prefix
  FROM public.business_settings
  WHERE business_id = p_business_id;

  v_seq_val := GREATEST(COALESCE(v_seq_val, 0) + 1, v_start_num);

  UPDATE public.business_invoice_sequences
  SET current_val = v_seq_val,
      prefix = v_prefix,
      updated_at = now()
  WHERE business_id = p_business_id;

  -- Format as INV-000001
  v_invoice_no := v_prefix || '-' || lpad(v_seq_val::TEXT, 6, '0');
  RETURN v_invoice_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(UUID) TO authenticated, service_role;

-- 5. Update create_sale to use next_invoice_number
CREATE OR REPLACE FUNCTION public.create_sale(
  p_customer_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_invoice_discount numeric,
  p_payments jsonb,
  p_notes text DEFAULT NULL::text,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_settings public.business_settings%ROWTYPE;
  v_sale_id UUID := gen_random_uuid();
  v_invoice_no TEXT; v_bid uuid; v_wh uuid; v_wname text; v_godown boolean;
  it JSONB; pay JSONB;
  v_prod public.products%ROWTYPE;
  v_qty NUMERIC; v_rate NUMERIC; v_disc NUMERIC; v_gst NUMERIC; v_avail NUMERIC;
  v_line_base NUMERIC; v_taxable NUMERIC; v_tax NUMERIC;
  v_subtotal NUMERIC := 0; v_disc_total NUMERIC := 0; v_taxable_total NUMERIC := 0;
  v_tax_total NUMERIC := 0; v_cogs NUMERIC := 0; v_paid NUMERIC := 0;
  v_grand NUMERIC; v_round NUMERIC;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND business_id = v_bid) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  v_godown := public.godown_enabled(v_bid);
  v_wh := public.resolve_warehouse(v_bid, CASE WHEN v_godown THEN p_warehouse_id ELSE NULL END);
  SELECT name INTO v_wname FROM public.warehouses WHERE id = v_wh;

  SELECT * INTO v_settings FROM public.business_settings WHERE business_id = v_bid LIMIT 1;
  
  -- Generate safe sequential invoice number
  v_invoice_no := public.next_invoice_number(v_bid);

  INSERT INTO public.sales (id, business_id, warehouse_id, invoice_no, customer_id, customer_name, notes, created_by)
  VALUES (v_sale_id, v_bid, v_wh, v_invoice_no, p_customer_id, COALESCE(p_customer_name,'Walk-in Customer'), p_notes, auth.uid());

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = (it->>'product_id')::UUID FOR UPDATE;
    IF NOT FOUND OR v_prod.business_id IS DISTINCT FROM v_bid THEN RAISE EXCEPTION 'Product not found'; END IF;
    v_qty := (it->>'quantity')::NUMERIC;
    v_rate := (it->>'rate')::NUMERIC;
    v_disc := COALESCE((it->>'discount')::NUMERIC,0);
    v_gst := COALESCE((it->>'gst_rate')::NUMERIC, v_prod.gst_rate);
    IF NOT COALESCE(v_settings.allow_negative_stock,false) THEN
      IF v_godown THEN
        v_avail := public.warehouse_available(v_wh, v_prod.id);
        IF v_avail < v_qty THEN
          RAISE EXCEPTION 'Insufficient stock for % at %. Available: %', v_prod.name, v_wname, v_avail;
        END IF;
      ELSIF v_prod.current_stock < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for %: available %, requested %', v_prod.name, v_prod.current_stock, v_qty;
      END IF;
    END IF;
    v_line_base := (v_qty * v_rate) - v_disc;
    IF v_prod.tax_inclusive THEN v_taxable := round(v_line_base / (1 + v_gst/100), 2);
    ELSE v_taxable := round(v_line_base, 2); END IF;
    v_tax := round(v_taxable * v_gst / 100, 2);

    INSERT INTO public.sale_items (business_id, sale_id, product_id, product_name, hsn_code, quantity, rate, discount, gst_rate, tax_amount, taxable_amount, total, cost_price)
    VALUES (v_bid, v_sale_id, v_prod.id, v_prod.name, v_prod.hsn_code, v_qty, v_rate, v_disc, v_gst, v_tax, v_taxable, v_taxable + v_tax, v_prod.purchase_price);

    INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_out, unit_cost, created_by)
    VALUES (v_bid, v_wh, v_prod.id, 'sale', 'sale', v_sale_id, v_invoice_no, v_qty, v_prod.purchase_price, auth.uid());

    v_subtotal := v_subtotal + (v_qty * v_rate);
    v_disc_total := v_disc_total + v_disc;
    v_taxable_total := v_taxable_total + v_taxable;
    v_tax_total := v_tax_total + v_tax;
    v_cogs := v_cogs + (v_qty * v_prod.purchase_price);
  END LOOP;

  v_taxable_total := v_taxable_total - COALESCE(p_invoice_discount,0);
  v_disc_total := v_disc_total + COALESCE(p_invoice_discount,0);
  v_grand := round(v_taxable_total + v_tax_total);
  v_round := v_grand - (v_taxable_total + v_tax_total);

  FOR pay IN SELECT * FROM jsonb_array_elements(COALESCE(p_payments,'[]'::jsonb)) LOOP
    INSERT INTO public.customer_payments (business_id, customer_id, sale_id, amount, method, reference_no)
    VALUES (v_bid, p_customer_id, v_sale_id, (pay->>'amount')::NUMERIC, (pay->>'method')::public.payment_method, pay->>'reference_no');
    v_paid := v_paid + (pay->>'amount')::NUMERIC;
  END LOOP;

  UPDATE public.sales SET subtotal = v_subtotal, discount_amount = v_disc_total,
    taxable_amount = v_taxable_total, cgst = round(v_tax_total/2,2), sgst = v_tax_total - round(v_tax_total/2,2),
    round_off = v_round, grand_total = v_grand, paid_amount = v_paid, cogs = v_cogs
  WHERE id = v_sale_id;

  IF p_customer_id IS NOT NULL AND v_paid < v_grand THEN
    UPDATE public.customers SET balance = balance + (v_grand - v_paid) WHERE id = p_customer_id;
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_bid, auth.uid(), 'Sales', 'Invoice Created', v_invoice_no, jsonb_build_object('total', v_grand, 'location', v_wname));

  RETURN v_sale_id;
END; $function$;

-- 6. WhatsApp and Multi-Channel Invoice Send History Table
CREATE TABLE IF NOT EXISTS public.invoice_send_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'sent',
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_email TEXT,
  error_message TEXT,
  message_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_send_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoice_send_history' AND policyname = 'Authenticated users can view invoice send history for own business'
  ) THEN
    CREATE POLICY "Authenticated users can view invoice send history for own business"
    ON public.invoice_send_history
    FOR SELECT
    TO authenticated
    USING (business_id = public.current_business_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoice_send_history' AND policyname = 'Authenticated users can insert invoice send history for own business'
  ) THEN
    CREATE POLICY "Authenticated users can insert invoice send history for own business"
    ON public.invoice_send_history
    FOR INSERT
    TO authenticated
    WITH CHECK (business_id = public.current_business_id());
  END IF;
END $$;

GRANT SELECT, INSERT ON public.invoice_send_history TO authenticated;

-- 7. Public secure invoice retrieval function by access_token
CREATE OR REPLACE FUNCTION public.get_public_invoice(p_access_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale RECORD;
  v_business RECORD;
  v_settings RECORD;
  v_items JSONB;
  v_payments JSONB;
  v_result JSONB;
BEGIN
  IF p_access_token IS NULL OR trim(p_access_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE access_token = p_access_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id, name, code, subdomain, logo_url, phone, email, website
  INTO v_business
  FROM public.businesses
  WHERE id = v_sale.business_id;

  SELECT business_name, address, phone, email, gstin, terms_conditions, invoice_prefix
  INTO v_settings
  FROM public.business_settings
  WHERE business_id = v_sale.business_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', si.id,
      'product_name', si.product_name,
      'hsn_code', si.hsn_code,
      'quantity', si.quantity,
      'rate', si.rate,
      'discount', si.discount,
      'gst_rate', si.gst_rate,
      'tax_amount', si.tax_amount,
      'taxable_amount', si.taxable_amount,
      'total', si.total
    )
  ) INTO v_items
  FROM public.sale_items si
  WHERE si.sale_id = v_sale.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', cp.id,
      'amount', cp.amount,
      'method', cp.method,
      'payment_date', cp.payment_date,
      'reference_no', cp.reference_no
    )
  ) INTO v_payments
  FROM public.customer_payments cp
  WHERE cp.sale_id = v_sale.id;

  v_result := jsonb_build_object(
    'invoice_no', v_sale.invoice_no,
    'invoice_date', v_sale.invoice_date,
    'customer_name', v_sale.customer_name,
    'subtotal', v_sale.subtotal,
    'discount_amount', v_sale.discount_amount,
    'taxable_amount', v_sale.taxable_amount,
    'cgst', v_sale.cgst,
    'sgst', v_sale.sgst,
    'igst', v_sale.igst,
    'round_off', v_sale.round_off,
    'grand_total', v_sale.grand_total,
    'paid_amount', v_sale.paid_amount,
    'status', v_sale.status,
    'notes', v_sale.notes,
    'items', COALESCE(v_items, '[]'::jsonb),
    'payments', COALESCE(v_payments, '[]'::jsonb),
    'business', jsonb_build_object(
      'name', COALESCE(v_settings.business_name, v_business.name),
      'address', v_settings.address,
      'phone', COALESCE(v_settings.phone, v_business.phone),
      'email', COALESCE(v_settings.email, v_business.email),
      'gstin', v_settings.gstin,
      'logo_url', v_business.logo_url,
      'terms', v_settings.terms_conditions
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_invoice(TEXT) TO anon, authenticated;
