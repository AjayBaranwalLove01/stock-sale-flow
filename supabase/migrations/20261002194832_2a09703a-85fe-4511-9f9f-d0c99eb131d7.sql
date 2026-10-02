CREATE OR REPLACE FUNCTION public.get_business_type(p_business_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_type FROM public.businesses WHERE id = p_business_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_business_type(uuid) TO authenticated;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS active_formulation text,
  ADD COLUMN IF NOT EXISTS business_type_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_batches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subcategory text;
CREATE INDEX IF NOT EXISTS idx_products_biz_formulation ON public.products(business_id, active_formulation);
CREATE INDEX IF NOT EXISTS idx_products_biz_name ON public.products(business_id, name);

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
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','quarantined','recalled','exhausted')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_batches_unique
  ON public.product_batches(business_id, product_id, batch_number, COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches(business_id, expiry_date, status);
CREATE INDEX IF NOT EXISTS idx_product_batches_prod ON public.product_batches(product_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_batches tenant select" ON public.product_batches FOR SELECT TO authenticated USING (public.can_access_business(business_id));
CREATE POLICY "product_batches tenant insert" ON public.product_batches FOR INSERT TO authenticated WITH CHECK (public.can_access_business(business_id));
CREATE POLICY "product_batches tenant update" ON public.product_batches FOR UPDATE TO authenticated USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));
CREATE POLICY "product_batches tenant delete" ON public.product_batches FOR DELETE TO authenticated USING (public.can_access_business(business_id));
CREATE TRIGGER update_product_batches_updated_at BEFORE UPDATE ON public.product_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_sku ON public.product_variants(business_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_prod ON public.product_variants(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_variants tenant select" ON public.product_variants FOR SELECT TO authenticated USING (public.can_access_business(business_id));
CREATE POLICY "product_variants tenant insert" ON public.product_variants FOR INSERT TO authenticated WITH CHECK (public.can_access_business(business_id));
CREATE POLICY "product_variants tenant update" ON public.product_variants FOR UPDATE TO authenticated USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));
CREATE POLICY "product_variants tenant delete" ON public.product_variants FOR DELETE TO authenticated USING (public.can_access_business(business_id));
CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_stock numeric,
  ADD COLUMN IF NOT EXISTS new_stock numeric;
CREATE INDEX IF NOT EXISTS idx_invtxn_batch ON public.inventory_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_invtxn_variant ON public.inventory_transactions(variant_id);

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS mrp numeric,
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pid UUID; wid UUID; bid UUID; b_id UUID; v_id UUID; v_s NUMERIC;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  wid := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  bid := COALESCE(NEW.business_id, OLD.business_id);
  b_id := COALESCE(NEW.batch_id, OLD.batch_id);
  v_id := COALESCE(NEW.variant_id, OLD.variant_id);

  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.products WHERE id = pid) THEN
    RETURN NULL;
  END IF;

  UPDATE public.products p SET current_stock = COALESCE((
    SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions WHERE product_id = pid),0) WHERE p.id = pid;

  IF wid IS NOT NULL THEN
    INSERT INTO public.warehouse_stock (business_id, warehouse_id, product_id, quantity)
    VALUES (bid, wid, pid, COALESCE((SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions
      WHERE product_id = pid AND warehouse_id = wid),0))
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
  END IF;

  IF b_id IS NOT NULL THEN
    v_s := COALESCE((SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions WHERE batch_id = b_id),0);
    UPDATE public.product_batches SET quantity = v_s,
      status = CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN 'expired'
                    WHEN v_s <= 0 THEN 'exhausted' ELSE 'active' END,
      updated_at = now()
    WHERE id = b_id;
  END IF;

  IF v_id IS NOT NULL THEN
    v_s := COALESCE((SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions WHERE variant_id = v_id),0);
    UPDATE public.product_variants SET current_stock = v_s, updated_at = now() WHERE id = v_id;
  END IF;
  RETURN NULL;
END; $function$;