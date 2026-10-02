-- Migration: Multi-Business Flexible Product & Inventory Structure
-- Tenant isolation, dynamic business types, active formulation, batches (FEFO), variants, stock ledger

-- 1. Helper function to get business type
CREATE OR REPLACE FUNCTION public.get_business_type(p_business_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_type FROM public.businesses WHERE id = p_business_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_business_type(uuid) TO authenticated, anon;

-- 2. Add product-level business-specific fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS active_formulation text,
  ADD COLUMN IF NOT EXISTS business_type_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_batches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subcategory text;

CREATE INDEX IF NOT EXISTS idx_products_biz_formulation ON public.products(business_id, active_formulation);
CREATE INDEX IF NOT EXISTS idx_products_biz_name ON public.products(business_id, name);

-- 3. Product Batches Table
CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL DEFAULT public.current_business_id() REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  manufacturing_date date,
  expiry_date date,
  purchase_date date DEFAULT CURRENT_DATE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_invoice_no text,
  purchase_price numeric NOT NULL DEFAULT 0,
  mrp numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  free_quantity numeric DEFAULT 0,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'quarantined', 'recalled', 'exhausted')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index per business, product, batch number, and optional warehouse
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_batches_unique
  ON public.product_batches(business_id, product_id, batch_number, COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_product_batches_expiry
  ON public.product_batches(business_id, expiry_date, status);

CREATE INDEX IF NOT EXISTS idx_product_batches_prod
  ON public.product_batches(product_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_batches tenant select" ON public.product_batches FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));

CREATE POLICY "product_batches tenant insert" ON public.product_batches FOR INSERT TO authenticated
  WITH CHECK (public.can_access_business(business_id));

CREATE POLICY "product_batches tenant update" ON public.product_batches FOR UPDATE TO authenticated
  USING (public.can_access_business(business_id))
  WITH CHECK (public.can_access_business(business_id));

CREATE POLICY "product_batches tenant delete" ON public.product_batches FOR DELETE TO authenticated
  USING (public.can_access_business(business_id));

CREATE TRIGGER update_product_batches_updated_at BEFORE UPDATE ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 4. Product Variants Table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL DEFAULT public.current_business_id() REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_name text NOT NULL,
  sku text,
  barcode text,
  purchase_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  mrp numeric NOT NULL DEFAULT 0,
  current_stock numeric NOT NULL DEFAULT 0,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_sku
  ON public.product_variants(business_id, sku) WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_variants_prod
  ON public.product_variants(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_variants tenant select" ON public.product_variants FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));

CREATE POLICY "product_variants tenant insert" ON public.product_variants FOR INSERT TO authenticated
  WITH CHECK (public.can_access_business(business_id));

CREATE POLICY "product_variants tenant update" ON public.product_variants FOR UPDATE TO authenticated
  USING (public.can_access_business(business_id))
  WITH CHECK (public.can_access_business(business_id));

CREATE POLICY "product_variants tenant delete" ON public.product_variants FOR DELETE TO authenticated
  USING (public.can_access_business(business_id));

CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 5. Extend inventory_transactions with batch_id, variant_id, previous_stock, new_stock
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_stock numeric,
  ADD COLUMN IF NOT EXISTS new_stock numeric;

CREATE INDEX IF NOT EXISTS idx_invtxn_batch ON public.inventory_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_invtxn_variant ON public.inventory_transactions(variant_id);


-- 6. Extend sale_items with batch and variant references
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- 7. Extend purchase_items with batch and variant references
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS mrp numeric,
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;


-- 8. Enhanced sync_product_stock() to also keep product_batches and product_variants in sync
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  pid UUID; wid UUID; bid UUID; b_id UUID; v_id UUID;
  v_batch_stock NUMERIC; v_var_stock NUMERIC;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  wid := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  bid := COALESCE(NEW.business_id, OLD.business_id);
  b_id := COALESCE(NEW.batch_id, OLD.batch_id);
  v_id := COALESCE(NEW.variant_id, OLD.variant_id);

  -- 1. Sync product current stock
  UPDATE public.products p SET current_stock = COALESCE((
    SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions WHERE product_id = pid
  ),0) WHERE p.id = pid;

  -- 2. Sync warehouse stock cache
  IF wid IS NOT NULL THEN
    INSERT INTO public.warehouse_stock (business_id, warehouse_id, product_id, quantity)
    VALUES (bid, wid, pid, COALESCE((
      SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions
      WHERE product_id = pid AND warehouse_id = wid),0))
    ON CONFLICT (warehouse_id, product_id) DO UPDATE
      SET quantity = EXCLUDED.quantity, updated_at = now();
  END IF;

  -- 3. Sync batch stock if batch_id exists
  IF b_id IS NOT NULL THEN
    v_batch_stock := COALESCE((
      SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions
      WHERE batch_id = b_id
    ), 0);
    UPDATE public.product_batches
    SET quantity = v_batch_stock,
        status = CASE
          WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN 'expired'
          WHEN v_batch_stock <= 0 THEN 'exhausted'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE id = b_id;
  END IF;

  -- 4. Sync variant stock if variant_id exists
  IF v_id IS NOT NULL THEN
    v_var_stock := COALESCE((
      SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions
      WHERE variant_id = v_id
    ), 0);
    UPDATE public.product_variants
    SET current_stock = v_var_stock,
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN NULL;
END; $function$;


-- 9. Auto FEFO (First Expiry, First Out) batch selector function
CREATE OR REPLACE FUNCTION public.get_product_fefo_batch(p_business_id uuid, p_product_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_batch_id uuid;
BEGIN
  SELECT id INTO v_batch_id
  FROM public.product_batches
  WHERE business_id = p_business_id
    AND product_id = p_product_id
    AND quantity > 0
    AND status = 'active'
    AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id OR warehouse_id IS NULL)
  ORDER BY
    CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
    expiry_date ASC,
    created_at ASC
  LIMIT 1;

  RETURN v_batch_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_product_fefo_batch(uuid, uuid, uuid) TO authenticated, service_role;


-- 10. Updated create_sale function supporting batches, FEFO, variants & strict tenant checks
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
  v_batch_id UUID; v_batch public.product_batches%ROWTYPE;
  v_variant_id UUID; v_prev_stock NUMERIC;
  v_biz_type TEXT;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND business_id = v_bid) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_biz_type := public.get_business_type(v_bid);
  v_godown := public.godown_enabled(v_bid);
  v_wh := public.resolve_warehouse(v_bid, CASE WHEN v_godown THEN p_warehouse_id ELSE NULL END);
  SELECT name INTO v_wname FROM public.warehouses WHERE id = v_wh;

  SELECT * INTO v_settings FROM public.business_settings WHERE business_id = v_bid LIMIT 1;
  
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
    v_batch_id := NULL;
    v_variant_id := NULL;

    -- Variant check
    IF it ? 'variant_id' AND (it->>'variant_id') IS NOT NULL AND (it->>'variant_id') <> '' THEN
      v_variant_id := (it->>'variant_id')::UUID;
      IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_variant_id AND product_id = v_prod.id AND business_id = v_bid) THEN
        RAISE EXCEPTION 'Variant not found';
      END IF;
    END IF;

    -- Batch selection: if specified, use it; else if product/business requires batches, use FEFO auto-selection
    IF it ? 'batch_id' AND (it->>'batch_id') IS NOT NULL AND (it->>'batch_id') <> '' THEN
      v_batch_id := (it->>'batch_id')::UUID;
    ELSIF v_prod.has_batches OR (v_biz_type ILIKE '%medical%' OR v_biz_type ILIKE '%pharmacy%') THEN
      v_batch_id := public.get_product_fefo_batch(v_bid, v_prod.id, v_wh);
    END IF;

    IF v_batch_id IS NOT NULL THEN
      SELECT * INTO v_batch FROM public.product_batches WHERE id = v_batch_id AND product_id = v_prod.id AND business_id = v_bid FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found for product %', v_prod.name; END IF;
      
      -- Expired check
      IF v_batch.expiry_date IS NOT NULL AND v_batch.expiry_date < CURRENT_DATE THEN
        IF NOT COALESCE((it->>'allow_expired')::BOOLEAN, false) THEN
          RAISE EXCEPTION 'Cannot sell expired batch % for product % (expired on %)', v_batch.batch_number, v_prod.name, v_batch.expiry_date;
        END IF;
      END IF;

      -- Check batch quantity if negative stock is disallowed
      IF NOT COALESCE(v_settings.allow_negative_stock,false) AND v_batch.quantity < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock in batch % for %: available %, requested %', v_batch.batch_number, v_prod.name, v_batch.quantity, v_qty;
      END IF;
    END IF;

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

    INSERT INTO public.sale_items (
      business_id, sale_id, product_id, product_name, hsn_code, quantity, rate, discount, gst_rate,
      tax_amount, taxable_amount, total, cost_price, batch_id, batch_number, expiry_date, variant_id
    ) VALUES (
      v_bid, v_sale_id, v_prod.id, v_prod.name, v_prod.hsn_code, v_qty, v_rate, v_disc, v_gst,
      v_tax, v_taxable, v_taxable + v_tax, v_prod.purchase_price,
      v_batch_id, v_batch.batch_number, v_batch.expiry_date, v_variant_id
    );

    v_prev_stock := v_prod.current_stock;

    INSERT INTO public.inventory_transactions (
      business_id, warehouse_id, product_id, batch_id, variant_id, txn_type, reference_type,
      reference_id, reference_no, qty_out, unit_cost, previous_stock, new_stock, created_by
    ) VALUES (
      v_bid, v_wh, v_prod.id, v_batch_id, v_variant_id, 'sale', 'sale',
      v_sale_id, v_invoice_no, v_qty, v_prod.purchase_price, v_prev_stock, v_prev_stock - v_qty, auth.uid()
    );

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


-- 11. Updated create_purchase function supporting batch creation/linking, MRP, variant & strict tenant checks
CREATE OR REPLACE FUNCTION public.create_purchase(
  p_supplier_id uuid,
  p_purchase_date date,
  p_due_date date,
  p_items jsonb,
  p_paid_amount numeric,
  p_notes text DEFAULT NULL::text,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id UUID := gen_random_uuid();
  v_no TEXT; v_seq INT; it JSONB; v_bid uuid; v_pbid uuid; v_wh uuid;
  v_qty NUMERIC; v_rate NUMERIC; v_disc NUMERIC; v_gst NUMERIC;
  v_base NUMERIC; v_tax NUMERIC;
  v_sub NUMERIC := 0; v_disct NUMERIC := 0; v_taxt NUMERIC := 0; v_grand NUMERIC;
  v_batch_id UUID; v_batch_no TEXT; v_exp_date DATE; v_mfg_date DATE;
  v_mrp NUMERIC; v_sell_price NUMERIC; v_variant_id UUID;
  v_free_qty NUMERIC; v_prod public.products%ROWTYPE;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND business_id = v_bid) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  v_wh := public.resolve_warehouse(v_bid, CASE WHEN public.godown_enabled(v_bid) THEN p_warehouse_id ELSE NULL END);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(purchase_no,'\D','','g'),'')::BIGINT),0)::INT + 1 INTO v_seq
  FROM public.purchases WHERE business_id = v_bid;
  v_no := 'PUR-' || lpad(v_seq::TEXT, 6, '0');

  INSERT INTO public.purchases (id, business_id, warehouse_id, purchase_no, supplier_id, purchase_date, due_date, notes, created_by)
  VALUES (v_id, v_bid, v_wh, v_no, p_supplier_id, COALESCE(p_purchase_date, CURRENT_DATE), p_due_date, p_notes, auth.uid());

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = (it->>'product_id')::UUID;
    IF NOT FOUND OR v_prod.business_id IS DISTINCT FROM v_bid THEN RAISE EXCEPTION 'Access denied'; END IF;
    
    v_qty := (it->>'quantity')::NUMERIC;
    v_rate := (it->>'rate')::NUMERIC;
    v_disc := COALESCE((it->>'discount')::NUMERIC,0);
    v_gst := COALESCE((it->>'gst_rate')::NUMERIC,0);
    v_mrp := COALESCE((it->>'mrp')::NUMERIC, v_prod.mrp);
    v_sell_price := COALESCE((it->>'selling_price')::NUMERIC, v_prod.selling_price);
    v_free_qty := COALESCE((it->>'free_quantity')::NUMERIC, 0);

    v_batch_id := NULL;
    v_batch_no := NULLIF(trim(COALESCE(it->>'batch_number', '')), '');
    v_exp_date := CASE WHEN (it->>'expiry_date') IS NOT NULL AND (it->>'expiry_date') <> '' THEN (it->>'expiry_date')::DATE ELSE NULL END;
    v_mfg_date := CASE WHEN (it->>'manufacturing_date') IS NOT NULL AND (it->>'manufacturing_date') <> '' THEN (it->>'manufacturing_date')::DATE ELSE NULL END;
    v_variant_id := CASE WHEN (it->>'variant_id') IS NOT NULL AND (it->>'variant_id') <> '' THEN (it->>'variant_id')::UUID ELSE NULL END;

    -- If batch number provided or product has batches, create/link batch
    IF v_batch_no IS NOT NULL THEN
      -- Check if batch already exists for this business + product + batch_number
      SELECT id INTO v_batch_id
      FROM public.product_batches
      WHERE business_id = v_bid AND product_id = v_prod.id AND batch_number = v_batch_no
      LIMIT 1;

      IF v_batch_id IS NULL THEN
        INSERT INTO public.product_batches (
          business_id, product_id, batch_number, manufacturing_date, expiry_date,
          purchase_date, supplier_id, purchase_invoice_no, purchase_price, mrp,
          selling_price, gst_rate, quantity, free_quantity, warehouse_id, status
        ) VALUES (
          v_bid, v_prod.id, v_batch_no, v_mfg_date, v_exp_date,
          COALESCE(p_purchase_date, CURRENT_DATE), p_supplier_id, v_no, v_rate, v_mrp,
          v_sell_price, v_gst, 0, v_free_qty, v_wh, 'active'
        ) RETURNING id INTO v_batch_id;
      ELSE
        -- Update batch pricing & dates if changed
        UPDATE public.product_batches
        SET mrp = COALESCE(v_mrp, mrp),
            selling_price = COALESCE(v_sell_price, selling_price),
            purchase_price = v_rate,
            expiry_date = COALESCE(v_exp_date, expiry_date),
            manufacturing_date = COALESCE(v_mfg_date, manufacturing_date),
            warehouse_id = COALESCE(v_wh, warehouse_id),
            status = 'active',
            updated_at = now()
        WHERE id = v_batch_id;
      END IF;

      -- Mark product as has_batches = true
      UPDATE public.products SET has_batches = true WHERE id = v_prod.id;
    END IF;

    v_base := (v_qty * v_rate) - v_disc;
    v_tax := round(v_base * v_gst / 100, 2);

    INSERT INTO public.purchase_items (
      business_id, purchase_id, product_id, quantity, rate, discount, gst_rate, tax_amount, total,
      batch_id, batch_number, expiry_date, mrp, selling_price, variant_id
    ) VALUES (
      v_bid, v_id, v_prod.id, v_qty, v_rate, v_disc, v_gst, v_tax, v_base + v_tax,
      v_batch_id, v_batch_no, v_exp_date, v_mrp, v_sell_price, v_variant_id
    );

    INSERT INTO public.inventory_transactions (
      business_id, warehouse_id, product_id, batch_id, variant_id, txn_type, reference_type,
      reference_id, reference_no, qty_in, unit_cost, previous_stock, new_stock, created_by
    ) VALUES (
      v_bid, v_wh, v_prod.id, v_batch_id, v_variant_id, 'purchase', 'purchase',
      v_id, v_no, v_qty + v_free_qty, v_rate, v_prod.current_stock, v_prod.current_stock + (v_qty + v_free_qty), auth.uid()
    );

    UPDATE public.products
    SET purchase_price = v_rate,
        mrp = CASE WHEN v_mrp > 0 THEN v_mrp ELSE mrp END,
        selling_price = CASE WHEN v_sell_price > 0 THEN v_sell_price ELSE selling_price END
    WHERE id = v_prod.id;

    v_sub := v_sub + (v_qty * v_rate);
    v_disct := v_disct + v_disc;
    v_taxt := v_taxt + v_tax;
  END LOOP;

  v_grand := round(v_sub - v_disct + v_taxt, 2);
  UPDATE public.purchases SET subtotal = v_sub, discount_amount = v_disct, tax_amount = v_taxt,
    grand_total = v_grand, paid_amount = COALESCE(p_paid_amount,0) WHERE id = v_id;

  IF COALESCE(p_paid_amount,0) > 0 THEN
    INSERT INTO public.supplier_payments (business_id, supplier_id, purchase_id, amount, method)
    VALUES (v_bid, p_supplier_id, v_id, p_paid_amount, 'cash');
  END IF;
  UPDATE public.suppliers SET balance = balance + (v_grand - COALESCE(p_paid_amount,0)) WHERE id = p_supplier_id;

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_bid, auth.uid(), 'Purchases', 'Purchase Created', v_no, jsonb_build_object('total', v_grand));

  RETURN v_id;
END; $function$;


-- 12. Migrate existing product batch data into product_batches table safely without losing history
DO $$
DECLARE
  rec RECORD;
  v_batch_id UUID;
BEGIN
  FOR rec IN
    SELECT p.id as prod_id, p.business_id, p.batch_number, p.manufacturing_date, p.expiry_date,
           p.purchase_price, p.mrp, p.selling_price, p.gst_rate, p.current_stock, p.supplier_id
    FROM public.products p
    WHERE p.batch_number IS NOT NULL AND trim(p.batch_number) <> ''
  LOOP
    INSERT INTO public.product_batches (
      business_id, product_id, batch_number, manufacturing_date, expiry_date,
      purchase_price, mrp, selling_price, gst_rate, quantity, supplier_id, status
    ) VALUES (
      rec.business_id, rec.prod_id, trim(rec.batch_number),
      rec.manufacturing_date::date, rec.expiry_date::date,
      COALESCE(rec.purchase_price, 0), COALESCE(rec.mrp, 0), COALESCE(rec.selling_price, 0),
      COALESCE(rec.gst_rate, 0), COALESCE(rec.current_stock, 0), rec.supplier_id,
      CASE
        WHEN rec.expiry_date IS NOT NULL AND rec.expiry_date::date < CURRENT_DATE THEN 'expired'
        WHEN COALESCE(rec.current_stock, 0) <= 0 THEN 'exhausted'
        ELSE 'active'
      END
    )
    ON CONFLICT (business_id, product_id, batch_number, COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET quantity = EXCLUDED.quantity
    RETURNING id INTO v_batch_id;

    UPDATE public.products SET has_batches = true WHERE id = rec.prod_id;

    -- Link existing opening transactions for this product to this batch if batch_id is null
    UPDATE public.inventory_transactions
    SET batch_id = v_batch_id
    WHERE product_id = rec.prod_id AND batch_id IS NULL;
  END LOOP;
END $$;
