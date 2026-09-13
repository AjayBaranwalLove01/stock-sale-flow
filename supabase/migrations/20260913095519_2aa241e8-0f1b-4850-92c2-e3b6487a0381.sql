-- Helpers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.godown_enabled(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_feature_enabled(_business_id, 'godown_management');
$$;

CREATE OR REPLACE FUNCTION public.default_warehouse_id(_business_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM public.warehouses
  WHERE business_id = _business_id AND is_active
  ORDER BY is_default DESC, created_at ASC LIMIT 1;
$$;

-- Validates a (possibly NULL) warehouse for the current user's business.
CREATE OR REPLACE FUNCTION public.resolve_warehouse(_business_id uuid, _warehouse_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_active boolean; v_bid uuid; v_has_limits boolean;
BEGIN
  IF _warehouse_id IS NULL THEN
    SELECT wa.warehouse_id INTO v_id
      FROM public.user_warehouse_access wa
      JOIN public.warehouses w ON w.id = wa.warehouse_id AND w.is_active
      WHERE wa.user_id = auth.uid() AND wa.business_id = _business_id
      ORDER BY w.is_default DESC LIMIT 1;
    RETURN COALESCE(v_id, public.default_warehouse_id(_business_id));
  END IF;

  SELECT business_id, is_active INTO v_bid, v_active FROM public.warehouses WHERE id = _warehouse_id;
  IF v_bid IS NULL OR v_bid IS DISTINCT FROM _business_id THEN RAISE EXCEPTION 'Invalid location'; END IF;
  IF NOT v_active THEN RAISE EXCEPTION 'This location is inactive'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_warehouse_access
                 WHERE user_id = auth.uid() AND business_id = _business_id) INTO v_has_limits;
  IF v_has_limits AND NOT EXISTS (
    SELECT 1 FROM public.user_warehouse_access
    WHERE user_id = auth.uid() AND warehouse_id = _warehouse_id) THEN
    RAISE EXCEPTION 'You do not have permission to access this location';
  END IF;
  RETURN _warehouse_id;
END; $$;

CREATE OR REPLACE FUNCTION public.warehouse_available(_warehouse_id uuid, _product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT quantity - reserved_quantity FROM public.warehouse_stock
                   WHERE warehouse_id = _warehouse_id AND product_id = _product_id), 0);
$$;

REVOKE EXECUTE ON FUNCTION public.godown_enabled(uuid), public.default_warehouse_id(uuid),
  public.resolve_warehouse(uuid, uuid), public.warehouse_available(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.godown_enabled(uuid), public.default_warehouse_id(uuid),
  public.resolve_warehouse(uuid, uuid), public.warehouse_available(uuid, uuid) TO authenticated;

-- Sales ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(p_customer_id uuid, p_customer_name text, p_items jsonb, p_invoice_discount numeric, p_payments jsonb, p_notes text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_settings public.business_settings%ROWTYPE;
  v_sale_id UUID := gen_random_uuid();
  v_invoice_no TEXT; v_seq INT; v_bid uuid; v_wh uuid; v_wname text; v_godown boolean;
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
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_no,'\D','','g'),'')::BIGINT),0)::INT INTO v_seq
  FROM public.sales WHERE business_id = v_bid;
  v_seq := GREATEST(v_seq + 1, COALESCE(v_settings.invoice_start_number,1));
  v_invoice_no := COALESCE(v_settings.invoice_prefix,'INV') || '-' || to_char(now(),'YYYY') || '-' || lpad(v_seq::TEXT, 6, '0');

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

CREATE OR REPLACE FUNCTION public.create_credit_sale(p_customer_id uuid, p_items jsonb, p_invoice_discount numeric, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_bid uuid; v_sale_id uuid; v_c public.customers%ROWTYPE;
  v_total numeric; v_inv text; v_terms int; v_due date;
  v_out numeric; v_block boolean; v_default int;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;

  SELECT * INTO v_c FROM public.customers WHERE id = p_customer_id AND business_id = v_bid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this business'; END IF;
  IF NOT v_c.credit_allowed THEN RAISE EXCEPTION 'Credit purchase is not enabled for %', v_c.name; END IF;

  SELECT COALESCE(credit_block_when_overdue, true), COALESCE(default_credit_terms_days, 15)
    INTO v_block, v_default FROM public.business_settings WHERE business_id = v_bid;

  IF COALESCE(v_block, true) AND EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE customer_id = v_c.id AND outstanding_amount > 0
      AND due_date < CURRENT_DATE AND status <> 'cancelled')
  THEN RAISE EXCEPTION 'Customer has overdue credit — settle it before a new credit sale'; END IF;

  v_sale_id := public.create_sale(p_customer_id, v_c.name, p_items,
                                  COALESCE(p_invoice_discount, 0), '[]'::jsonb, p_notes, p_warehouse_id);

  SELECT grand_total, invoice_no INTO v_total, v_inv FROM public.sales WHERE id = v_sale_id;

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_out
    FROM public.credit_transactions WHERE customer_id = v_c.id AND status <> 'cancelled';
  IF v_c.credit_limit > 0 AND (v_out + v_total) > v_c.credit_limit THEN
    RAISE EXCEPTION 'Credit limit exceeded: limit %, already outstanding %, this sale %',
      v_c.credit_limit, v_out, v_total;
  END IF;

  v_terms := GREATEST(COALESCE(NULLIF(v_c.credit_terms_days, 0), COALESCE(v_default, 15)), 1);
  v_due := COALESCE(p_due_date, CURRENT_DATE + v_terms);
  IF v_due < CURRENT_DATE THEN RAISE EXCEPTION 'Due date cannot be in the past'; END IF;

  INSERT INTO public.credit_transactions (business_id, customer_id, sale_id, reference_no,
    credit_date, due_date, terms_days, original_amount, paid_amount, outstanding_amount,
    status, notes, created_by)
  VALUES (v_bid, v_c.id, v_sale_id, v_inv, CURRENT_DATE, v_due,
    (v_due - CURRENT_DATE), v_total, 0, v_total, 'active', p_notes, auth.uid());

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_bid, auth.uid(), 'Credit', 'Credit Sale Created', v_inv,
          jsonb_build_object('customer', v_c.name, 'amount', v_total, 'due_date', v_due));

  RETURN v_sale_id;
END; $function$;

-- Purchases -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase(p_supplier_id uuid, p_purchase_date date, p_due_date date, p_items jsonb, p_paid_amount numeric, p_notes text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id UUID := gen_random_uuid();
  v_no TEXT; v_seq INT; it JSONB; v_bid uuid; v_pbid uuid; v_wh uuid;
  v_qty NUMERIC; v_rate NUMERIC; v_disc NUMERIC; v_gst NUMERIC;
  v_base NUMERIC; v_tax NUMERIC;
  v_sub NUMERIC := 0; v_disct NUMERIC := 0; v_taxt NUMERIC := 0; v_grand NUMERIC;
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
    SELECT business_id INTO v_pbid FROM public.products WHERE id = (it->>'product_id')::UUID;
    IF v_pbid IS DISTINCT FROM v_bid THEN RAISE EXCEPTION 'Access denied'; END IF;
    v_qty := (it->>'quantity')::NUMERIC;
    v_rate := (it->>'rate')::NUMERIC;
    v_disc := COALESCE((it->>'discount')::NUMERIC,0);
    v_gst := COALESCE((it->>'gst_rate')::NUMERIC,0);
    v_base := (v_qty * v_rate) - v_disc;
    v_tax := round(v_base * v_gst / 100, 2);

    INSERT INTO public.purchase_items (business_id, purchase_id, product_id, quantity, rate, discount, gst_rate, tax_amount, total)
    VALUES (v_bid, v_id, (it->>'product_id')::UUID, v_qty, v_rate, v_disc, v_gst, v_tax, v_base + v_tax);

    INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_in, unit_cost, created_by)
    VALUES (v_bid, v_wh, (it->>'product_id')::UUID, 'purchase', 'purchase', v_id, v_no, v_qty, v_rate, auth.uid());

    UPDATE public.products SET purchase_price = v_rate WHERE id = (it->>'product_id')::UUID;

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

-- Returns -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sales_return(p_sale_id uuid, p_items jsonb, p_reason text, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id UUID := gen_random_uuid(); v_no TEXT; v_seq INT; it JSONB; v_bid uuid; v_wh uuid; v_sale_wh uuid;
  v_item public.sale_items%ROWTYPE; v_qty NUMERIC; v_amt NUMERIC := 0; v_cust UUID;
BEGIN
  SELECT customer_id, business_id, warehouse_id INTO v_cust, v_bid, v_sale_wh FROM public.sales WHERE id = p_sale_id;
  IF v_bid IS NULL OR NOT public.can_access_business(v_bid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  v_wh := public.resolve_warehouse(v_bid, COALESCE(CASE WHEN public.godown_enabled(v_bid) THEN p_warehouse_id END, v_sale_wh));

  SELECT COALESCE(count(*),0)::INT + 1 INTO v_seq FROM public.sales_returns WHERE business_id = v_bid;
  v_no := 'SR-' || lpad(v_seq::TEXT, 6, '0');
  INSERT INTO public.sales_returns (id, business_id, warehouse_id, return_no, sale_id, customer_id, reason, created_by)
  VALUES (v_id, v_bid, v_wh, v_no, p_sale_id, v_cust, p_reason, auth.uid());

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_item FROM public.sale_items WHERE id = (it->>'sale_item_id')::UUID AND sale_id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid sale item'; END IF;
    v_qty := (it->>'quantity')::NUMERIC;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_item.returned_qty + v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'Cannot return more than sold quantity for %', v_item.product_name;
    END IF;
    UPDATE public.sale_items SET returned_qty = returned_qty + v_qty WHERE id = v_item.id;
    INSERT INTO public.sales_return_items (business_id, return_id, sale_item_id, product_id, quantity, rate, amount)
    VALUES (v_bid, v_id, v_item.id, v_item.product_id, v_qty, v_item.rate, v_qty * v_item.rate);
    INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_in, unit_cost, created_by)
    VALUES (v_bid, v_wh, v_item.product_id, 'sales_return', 'sales_return', v_id, v_no, v_qty, v_item.cost_price, auth.uid());
    v_amt := v_amt + (v_qty * v_item.rate);
  END LOOP;

  UPDATE public.sales_returns SET total_amount = v_amt WHERE id = v_id;
  IF v_cust IS NOT NULL THEN UPDATE public.customers SET balance = balance - v_amt WHERE id = v_cust; END IF;
  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_bid, auth.uid(), 'Sales Return', 'Return Created', v_no, jsonb_build_object('amount', v_amt));
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.create_purchase_return(p_purchase_id uuid, p_items jsonb, p_reason text, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id UUID := gen_random_uuid(); v_no TEXT; v_seq INT; it JSONB; v_bid uuid; v_wh uuid; v_pur_wh uuid;
  v_item public.purchase_items%ROWTYPE; v_qty NUMERIC; v_amt NUMERIC := 0; v_supp UUID;
  v_allow_neg boolean; v_avail numeric; v_wname text; v_pname text;
BEGIN
  SELECT supplier_id, business_id, warehouse_id INTO v_supp, v_bid, v_pur_wh FROM public.purchases WHERE id = p_purchase_id;
  IF v_bid IS NULL OR NOT public.can_access_business(v_bid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  v_wh := public.resolve_warehouse(v_bid, COALESCE(CASE WHEN public.godown_enabled(v_bid) THEN p_warehouse_id END, v_pur_wh));
  SELECT name INTO v_wname FROM public.warehouses WHERE id = v_wh;
  SELECT COALESCE(allow_negative_stock,false) INTO v_allow_neg FROM public.business_settings WHERE business_id = v_bid;

  SELECT COALESCE(count(*),0)::INT + 1 INTO v_seq FROM public.purchase_returns WHERE business_id = v_bid;
  v_no := 'PR-' || lpad(v_seq::TEXT, 6, '0');
  INSERT INTO public.purchase_returns (id, business_id, warehouse_id, return_no, purchase_id, supplier_id, reason, created_by)
  VALUES (v_id, v_bid, v_wh, v_no, p_purchase_id, v_supp, p_reason, auth.uid());

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_item FROM public.purchase_items WHERE id = (it->>'purchase_item_id')::UUID AND purchase_id = p_purchase_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid purchase item'; END IF;
    v_qty := (it->>'quantity')::NUMERIC;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_item.returned_qty + v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'Cannot return more than purchased quantity';
    END IF;
    IF NOT COALESCE(v_allow_neg,false) AND public.godown_enabled(v_bid) THEN
      v_avail := public.warehouse_available(v_wh, v_item.product_id);
      IF v_avail < v_qty THEN
        SELECT name INTO v_pname FROM public.products WHERE id = v_item.product_id;
        RAISE EXCEPTION 'Insufficient stock for % at %. Available: %', v_pname, v_wname, v_avail;
      END IF;
    END IF;
    UPDATE public.purchase_items SET returned_qty = returned_qty + v_qty WHERE id = v_item.id;
    INSERT INTO public.purchase_return_items (business_id, return_id, purchase_item_id, product_id, quantity, rate, amount)
    VALUES (v_bid, v_id, v_item.id, v_item.product_id, v_qty, v_item.rate, v_qty * v_item.rate);
    INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_out, unit_cost, created_by)
    VALUES (v_bid, v_wh, v_item.product_id, 'purchase_return', 'purchase_return', v_id, v_no, v_qty, v_item.rate, auth.uid());
    v_amt := v_amt + (v_qty * v_item.rate);
  END LOOP;

  UPDATE public.purchase_returns SET total_amount = v_amt WHERE id = v_id;
  IF v_supp IS NOT NULL THEN UPDATE public.suppliers SET balance = balance - v_amt WHERE id = v_supp; END IF;
  RETURN v_id;
END; $function$;

-- Stock adjustment ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id uuid, p_qty numeric, p_reason text, p_notes text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_prev NUMERIC; v_id UUID; v_pbid uuid; v_wh uuid; v_godown boolean;
BEGIN
  SELECT current_stock, business_id INTO v_prev, v_pbid FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_pbid IS NULL OR NOT public.can_access_business(v_pbid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  v_godown := public.godown_enabled(v_pbid);
  v_wh := public.resolve_warehouse(v_pbid, CASE WHEN v_godown THEN p_warehouse_id ELSE NULL END);
  IF v_godown THEN v_prev := public.warehouse_available(v_wh, p_product_id); END IF;

  INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, qty_in, qty_out, notes, created_by)
  VALUES (v_pbid, v_wh, p_product_id, 'adjustment', 'adjustment', GREATEST(p_qty,0), GREATEST(-p_qty,0), p_reason, auth.uid());
  INSERT INTO public.stock_adjustments (business_id, warehouse_id, product_id, previous_stock, adjustment_qty, new_stock, reason, notes, created_by)
  VALUES (v_pbid, v_wh, p_product_id, v_prev, p_qty, v_prev + p_qty, p_reason, p_notes, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- Online orders ship from the default location ------------------------
CREATE OR REPLACE FUNCTION public.place_order(p_business_id uuid, p_items jsonb, p_name text, p_email text, p_phone text, p_address text, p_city text, p_state text, p_pincode text, p_notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_id uuid := gen_random_uuid(); v_no text; v_seq int; it jsonb; v_wh uuid;
  v_prod public.products%ROWTYPE; v_cust uuid; v_qty numeric;
  v_line numeric; v_tax numeric; v_taxable numeric;
  v_sub numeric := 0; v_taxt numeric := 0; v_total numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id
    AND status = 'active' AND customer_site_enabled) THEN
    RAISE EXCEPTION 'Storefront unavailable';
  END IF;
  IF NOT public.is_feature_enabled(p_business_id, 'online_orders') THEN
    RAISE EXCEPTION 'Online ordering is disabled';
  END IF;
  v_wh := public.default_warehouse_id(p_business_id);

  SELECT id INTO v_cust FROM public.customers
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id;
  IF v_cust IS NULL THEN
    INSERT INTO public.customers (business_id, name, mobile, email, address, city, state, pincode, auth_user_id, source)
    VALUES (p_business_id, COALESCE(p_name,'Customer'), p_phone, p_email, p_address, p_city, p_state, p_pincode, auth.uid(), 'storefront')
    RETURNING id INTO v_cust;
  END IF;

  SELECT COALESCE(count(*),0)::int + 1 INTO v_seq FROM public.orders WHERE business_id = p_business_id;
  v_no := 'ORD-' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.orders (id, business_id, warehouse_id, order_no, customer_id, customer_name, customer_email,
    customer_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, notes, placed_by)
  VALUES (v_id, p_business_id, v_wh, v_no, v_cust, COALESCE(p_name,'Customer'), p_email, p_phone,
    p_address, p_city, p_state, p_pincode, p_notes, auth.uid());

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM public.products
      WHERE id = (it->>'product_id')::uuid AND business_id = p_business_id AND status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    v_qty := GREATEST((it->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_prod.current_stock < v_qty THEN
      RAISE EXCEPTION 'Only % left of %', v_prod.current_stock, v_prod.name;
    END IF;
    v_line := v_qty * v_prod.selling_price;
    IF v_prod.tax_inclusive THEN v_taxable := round(v_line / (1 + v_prod.gst_rate/100), 2);
    ELSE v_taxable := round(v_line, 2); END IF;
    v_tax := round(v_taxable * v_prod.gst_rate / 100, 2);

    INSERT INTO public.order_items (business_id, order_id, product_id, product_name, quantity, rate, gst_rate, tax_amount, total)
    VALUES (p_business_id, v_id, v_prod.id, v_prod.name, v_qty, v_prod.selling_price, v_prod.gst_rate, v_tax, v_taxable + v_tax);

    INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_out, unit_cost, created_by)
    VALUES (p_business_id, v_wh, v_prod.id, 'sale', 'order', v_id, v_no, v_qty, v_prod.purchase_price, auth.uid());

    v_sub := v_sub + v_taxable;
    v_taxt := v_taxt + v_tax;
  END LOOP;

  IF v_sub = 0 THEN RAISE EXCEPTION 'Your cart is empty'; END IF;
  v_total := round(v_sub + v_taxt, 2);
  UPDATE public.orders SET subtotal = v_sub, tax_amount = v_taxt, grand_total = v_total WHERE id = v_id;

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (p_business_id, auth.uid(), 'Orders', 'Order Placed', v_no, jsonb_build_object('total', v_total));

  RETURN v_id;
END; $function$;

-- Warehouse management + transfers ------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_warehouse(p_warehouse_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_bid uuid;
BEGIN
  SELECT business_id INTO v_bid FROM public.warehouses WHERE id = p_warehouse_id;
  IF v_bid IS NULL OR NOT public.can_access_business(v_bid) OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE public.warehouses SET is_default = false WHERE business_id = v_bid AND is_default;
  UPDATE public.warehouses SET is_default = true, is_active = true WHERE id = p_warehouse_id;
  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id)
  VALUES (v_bid, auth.uid(), 'Warehouses', 'Default Location Changed', p_warehouse_id::text);
END; $function$;

CREATE OR REPLACE FUNCTION public.create_stock_transfer(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_items jsonb, p_remarks text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_bid uuid; v_id uuid := gen_random_uuid(); v_no text; v_seq int; it jsonb;
  v_from uuid; v_to uuid; v_qty numeric; v_avail numeric;
  v_pid uuid; v_pbid uuid; v_pname text; v_fname text; v_cost numeric;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT public.godown_enabled(v_bid) THEN
    RAISE EXCEPTION 'Godown management is not enabled for this business';
  END IF;

  v_from := public.resolve_warehouse(v_bid, p_from_warehouse_id);
  v_to := public.resolve_warehouse(v_bid, p_to_warehouse_id);
  IF v_from IS NULL OR v_to IS NULL THEN RAISE EXCEPTION 'Invalid location'; END IF;
  IF v_from = v_to THEN RAISE EXCEPTION 'Source and destination must be different locations'; END IF;
  SELECT name INTO v_fname FROM public.warehouses WHERE id = v_from;

  SELECT COALESCE(count(*),0)::int + 1 INTO v_seq FROM public.stock_transfers WHERE business_id = v_bid;
  v_no := 'TRF-' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.stock_transfers (id, business_id, transfer_number, from_warehouse_id, to_warehouse_id,
    status, requested_by, requested_at, completed_at, remarks)
  VALUES (v_id, v_bid, v_no, v_from, v_to, 'COMPLETED', auth.uid(), now(), now(), p_remarks);

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (it->>'product_id')::uuid;
    v_qty := (it->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Transfer quantity must be greater than zero'; END IF;
    SELECT business_id, name, purchase_price INTO v_pbid, v_pname, v_cost FROM public.products WHERE id = v_pid FOR UPDATE;
    IF v_pbid IS DISTINCT FROM v_bid THEN RAISE EXCEPTION 'Product does not belong to this business'; END IF;

    PERFORM 1 FROM public.warehouse_stock WHERE warehouse_id = v_from AND product_id = v_pid FOR UPDATE;
    v_avail := public.warehouse_available(v_from, v_pid);
    IF v_avail < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % at %. Available: %', v_pname, v_fname, v_avail;
    END IF;

    INSERT INTO public.stock_transfer_items (business_id, transfer_id, product_id, requested_qty, sent_qty, received_qty, remarks)
    VALUES (v_bid, v_id, v_pid, v_qty, v_qty, v_qty, it->>'remarks');

    INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_out, unit_cost, created_by)
    VALUES (v_bid, v_from, v_pid, 'transfer_out', 'stock_transfer', v_id, v_no, v_qty, COALESCE(v_cost,0), auth.uid());
    INSERT INTO public.inventory_transactions (business_id, warehouse_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_in, unit_cost, created_by)
    VALUES (v_bid, v_to, v_pid, 'transfer_in', 'stock_transfer', v_id, v_no, v_qty, COALESCE(v_cost,0), auth.uid());
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = v_id) THEN
    RAISE EXCEPTION 'Add at least one product to transfer';
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_bid, auth.uid(), 'Stock Transfer', 'Transfer Completed', v_no,
    jsonb_build_object('from', v_from, 'to', v_to));

  RETURN v_id;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, jsonb, text),
  public.set_default_warehouse(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, jsonb, text),
  public.set_default_warehouse(uuid) TO authenticated;