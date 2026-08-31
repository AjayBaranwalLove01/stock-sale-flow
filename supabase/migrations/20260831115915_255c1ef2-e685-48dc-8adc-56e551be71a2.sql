-- 1. Barcode type on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode_type text;

-- Normalise blanks so the unique index behaves
UPDATE public.products SET barcode = NULL WHERE barcode IS NOT NULL AND btrim(barcode) = '';

-- 2. Barcode unique per business
CREATE UNIQUE INDEX IF NOT EXISTS products_business_barcode_uidx
  ON public.products (business_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products (barcode);

-- 3. Register the feature
INSERT INTO public.features (key, name, description, category, depends_on, enabled_globally)
VALUES ('barcode_management', 'Barcode Management',
        'Barcode scanning for product entry, stock receiving, POS sales, generation and label printing.',
        'Operations', NULL, true)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category;

-- 4. Staff barcode lookup (tenant-scoped, feature-gated)
CREATE OR REPLACE FUNCTION public.lookup_product_by_barcode(p_barcode text)
RETURNS TABLE (
  id uuid, sku text, name text, barcode text, barcode_type text,
  selling_price numeric, purchase_price numeric, mrp numeric, gst_rate numeric,
  tax_inclusive boolean, current_stock numeric, unit text, status public.record_status,
  category_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_bid uuid;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF NOT public.is_feature_enabled(v_bid, 'barcode_management') THEN
    RAISE EXCEPTION 'Barcode feature is disabled';
  END IF;
  IF p_barcode IS NULL OR btrim(p_barcode) = '' THEN RAISE EXCEPTION 'Invalid barcode'; END IF;

  RETURN QUERY
  SELECT p.id, p.sku, p.name, p.barcode, p.barcode_type, p.selling_price, p.purchase_price,
         p.mrp, p.gst_rate, p.tax_inclusive, p.current_stock, p.unit, p.status, p.category_id
  FROM public.products p
  WHERE p.business_id = v_bid AND p.barcode = btrim(p_barcode)
  LIMIT 1;
END; $$;

-- 5. Internal barcode generation (never a fake EAN/UPC)
CREATE OR REPLACE FUNCTION public.generate_internal_barcode(p_product_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_bid uuid; v_code text; v_candidate text; v_seq int := 0; v_pbid uuid;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF NOT public.is_feature_enabled(v_bid, 'barcode_management') THEN
    RAISE EXCEPTION 'Barcode feature is disabled';
  END IF;

  SELECT upper(regexp_replace(coalesce(code, 'BIZ'), '[^A-Za-z0-9]', '', 'g')) INTO v_code
  FROM public.businesses WHERE id = v_bid;
  v_code := left(coalesce(nullif(v_code, ''), 'BIZ'), 6);

  IF p_product_id IS NOT NULL THEN
    SELECT business_id INTO v_pbid FROM public.products WHERE id = p_product_id;
    IF v_pbid IS DISTINCT FROM v_bid THEN RAISE EXCEPTION 'Access denied'; END IF;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(barcode, '\D', '', 'g'), '')::bigint), 0)::int
  INTO v_seq
  FROM public.products
  WHERE business_id = v_bid AND barcode LIKE ('INT-' || v_code || '-%');

  LOOP
    v_seq := v_seq + 1;
    v_candidate := 'INT-' || v_code || '-' || lpad(v_seq::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.products WHERE business_id = v_bid AND barcode = v_candidate
    );
  END LOOP;

  IF p_product_id IS NOT NULL THEN
    UPDATE public.products SET barcode = v_candidate, barcode_type = 'CODE128' WHERE id = p_product_id;
    INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
    VALUES (v_bid, auth.uid(), 'Barcode', 'Barcode Generated', p_product_id::text,
            jsonb_build_object('barcode', v_candidate, 'type', 'CODE128'));
  END IF;

  RETURN v_candidate;
END; $$;

-- 6. Barcode stock receiving through the existing inventory ledger
CREATE OR REPLACE FUNCTION public.receive_stock_by_barcode(p_items jsonb, p_notes text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bid uuid; it jsonb; v_prod public.products%ROWTYPE;
  v_qty numeric; v_cost numeric; v_sell numeric; v_ref text; v_count int := 0;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF NOT public.is_feature_enabled(v_bid, 'barcode_management') THEN
    RAISE EXCEPTION 'Barcode feature is disabled';
  END IF;

  v_ref := 'SE-' || to_char(now(), 'YYYYMMDDHH24MISS');

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM public.products
      WHERE id = (it->>'product_id')::uuid AND business_id = v_bid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found in this business'; END IF;
    IF v_prod.status <> 'active' THEN RAISE EXCEPTION 'Product % is inactive', v_prod.name; END IF;

    v_qty := (it->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    v_cost := NULLIF(it->>'purchase_price', '')::numeric;
    v_sell := NULLIF(it->>'selling_price', '')::numeric;

    IF v_cost IS NOT NULL OR v_sell IS NOT NULL THEN
      UPDATE public.products
        SET purchase_price = COALESCE(v_cost, purchase_price),
            selling_price = COALESCE(v_sell, selling_price)
      WHERE id = v_prod.id;
    END IF;

    INSERT INTO public.inventory_transactions
      (business_id, product_id, txn_type, reference_type, reference_no, qty_in, unit_cost, notes, created_by)
    VALUES (v_bid, v_prod.id, 'purchase', 'barcode_stock_entry', v_ref, v_qty,
            COALESCE(v_cost, v_prod.purchase_price), p_notes, auth.uid());

    INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
    VALUES (v_bid, auth.uid(), 'Barcode', 'Stock Received Using Barcode', v_ref,
            jsonb_build_object('product', v_prod.name, 'barcode', v_prod.barcode, 'quantity', v_qty));

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN RAISE EXCEPTION 'Nothing to receive'; END IF;
  RETURN v_count;
END; $$;

-- 7. Shopper-side barcode lookup (public catalogue rules only)
CREATE OR REPLACE FUNCTION public.storefront_product_by_barcode(p_business_id uuid, p_barcode text)
RETURNS TABLE (id uuid, name text, sku text, selling_price numeric, mrp numeric, unit text, in_stock boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.name, p.sku, p.selling_price, p.mrp, p.unit, (p.current_stock > 0)
  FROM public.products p
  JOIN public.businesses b ON b.id = p.business_id
  WHERE p.business_id = p_business_id
    AND p.barcode = btrim(p_barcode)
    AND p.status = 'active'
    AND b.status = 'active'
    AND b.customer_site_enabled
    AND public.is_feature_enabled(p_business_id, 'barcode_management')
  LIMIT 1;
$$;

-- 8. Grants
REVOKE ALL ON FUNCTION public.lookup_product_by_barcode(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_internal_barcode(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_stock_by_barcode(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_product_by_barcode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_internal_barcode(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_stock_by_barcode(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_product_by_barcode(uuid, text) TO anon, authenticated;