-- ============ 1. BUSINESSES ============
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  business_type text,
  subdomain text NOT NULL UNIQUE,
  logo_url text,
  address text,
  city text,
  state text,
  country text NOT NULL DEFAULT 'India',
  pincode text,
  phone text,
  email text,
  website text,
  status text NOT NULL DEFAULT 'active',
  customer_site_enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_status_chk CHECK (status IN ('active','inactive','suspended')),
  CONSTRAINT businesses_subdomain_chk CHECK (subdomain ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$'),
  CONSTRAINT businesses_subdomain_reserved_chk CHECK (subdomain NOT IN
    ('admin','api','www','mail','support','help','app','login','auth','static','assets','cdn','dev','preview','superadmin','dashboard'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT SELECT ON public.businesses TO anon;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 2. TENANT COLUMNS ============
ALTER TABLE public.profiles
  ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  ADD COLUMN active_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.user_roles ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.business_settings ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.purchases ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_items ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_returns ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_return_items ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sale_items ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sales_returns ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sales_return_items ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.customer_payments ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.supplier_payments ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_transactions ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustments ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.catalog_images ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;

-- ============ 3. BACKFILL: existing data -> first business ============
DO $$
DECLARE v_bid uuid; v_s public.business_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_s FROM public.business_settings LIMIT 1;
  INSERT INTO public.businesses (name, code, business_type, subdomain, logo_url, address, city, state, country, phone, email, website, status)
  VALUES (
    COALESCE(v_s.business_name, 'Primary Business'), 'BIZ001', 'Retail', 'ajay',
    v_s.logo_url, v_s.address, NULL, COALESCE(v_s.state,'Karnataka'), 'India', v_s.phone, v_s.email, v_s.website, 'active'
  ) RETURNING id INTO v_bid;

  UPDATE public.profiles SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.user_roles SET business_id = v_bid WHERE business_id IS NULL AND role <> 'super_admin';
  UPDATE public.business_settings SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.categories SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.products SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.customers SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.suppliers SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.purchases SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.purchase_items SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.purchase_returns SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.purchase_return_items SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.sales SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.sale_items SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.sales_returns SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.sales_return_items SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.customer_payments SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.supplier_payments SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.inventory_transactions SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.stock_adjustments SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.audit_logs SET business_id = v_bid WHERE business_id IS NULL;
  UPDATE public.catalog_images SET business_id = v_bid WHERE business_id IS NULL;
END $$;

-- ============ 4. TENANT HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin');
$$;

-- The business the caller's records belong to (super admin may switch context)
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_super_admin() THEN COALESCE(p.active_business_id, p.business_id)
    ELSE p.business_id
  END
  FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- Row visible? own business, or super admin (all businesses when no context set)
CREATE OR REPLACE FUNCTION public.can_access_business(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_super_admin() THEN
      COALESCE((SELECT active_business_id FROM public.profiles WHERE id = auth.uid()), _business_id) = _business_id
    ELSE _business_id IS NOT NULL
      AND _business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_business_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_business(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_business(uuid) TO authenticated;

-- ============ 5. DEFAULTS + NOT NULL ============
ALTER TABLE public.categories ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.products ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.customers ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.suppliers ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.purchases ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.purchase_items ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.purchase_returns ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.purchase_return_items ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.sales ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.sale_items ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.sales_returns ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.sales_return_items ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.customer_payments ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.supplier_payments ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.inventory_transactions ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.stock_adjustments ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.audit_logs ALTER COLUMN business_id SET DEFAULT public.current_business_id();
ALTER TABLE public.catalog_images ALTER COLUMN business_id SET DEFAULT public.current_business_id();

ALTER TABLE public.business_settings ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.purchases ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.purchase_items ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.sale_items ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.inventory_transactions ALTER COLUMN business_id SET NOT NULL;

-- ============ 6. PER-BUSINESS UNIQUENESS ============
ALTER TABLE public.business_settings DROP CONSTRAINT business_settings_singleton_key;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_business_key UNIQUE (business_id);
ALTER TABLE public.categories DROP CONSTRAINT categories_code_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_business_code_key UNIQUE (business_id, code);
ALTER TABLE public.products DROP CONSTRAINT products_sku_key;
ALTER TABLE public.products ADD CONSTRAINT products_business_sku_key UNIQUE (business_id, sku);
ALTER TABLE public.products DROP CONSTRAINT products_barcode_key;
CREATE UNIQUE INDEX products_business_barcode_key ON public.products (business_id, barcode) WHERE barcode IS NOT NULL;
ALTER TABLE public.sales DROP CONSTRAINT sales_invoice_no_key;
ALTER TABLE public.sales ADD CONSTRAINT sales_business_invoice_key UNIQUE (business_id, invoice_no);
ALTER TABLE public.purchases DROP CONSTRAINT purchases_purchase_no_key;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_business_no_key UNIQUE (business_id, purchase_no);
ALTER TABLE public.sales_returns DROP CONSTRAINT sales_returns_return_no_key;
ALTER TABLE public.sales_returns ADD CONSTRAINT sales_returns_business_no_key UNIQUE (business_id, return_no);
ALTER TABLE public.purchase_returns DROP CONSTRAINT purchase_returns_return_no_key;
ALTER TABLE public.purchase_returns ADD CONSTRAINT purchase_returns_business_no_key UNIQUE (business_id, return_no);

CREATE INDEX idx_products_business ON public.products(business_id);
CREATE INDEX idx_categories_business ON public.categories(business_id);
CREATE INDEX idx_customers_business ON public.customers(business_id);
CREATE INDEX idx_sales_business ON public.sales(business_id);
CREATE INDEX idx_purchases_business ON public.purchases(business_id);
CREATE INDEX idx_invtxn_business ON public.inventory_transactions(business_id);

-- ============ 7. RLS POLICIES ============
CREATE POLICY "businesses readable by members" ON public.businesses FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = (SELECT business_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "businesses managed by super admin" ON public.businesses FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY "settings auth all" ON public.business_settings;
CREATE POLICY "settings tenant" ON public.business_settings FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "categories auth all" ON public.categories;
CREATE POLICY "categories tenant" ON public.categories FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "products auth all" ON public.products;
CREATE POLICY "products tenant" ON public.products FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "customers auth all" ON public.customers;
CREATE POLICY "customers tenant" ON public.customers FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "suppliers auth all" ON public.suppliers;
CREATE POLICY "suppliers tenant" ON public.suppliers FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "purchases auth all" ON public.purchases;
CREATE POLICY "purchases tenant" ON public.purchases FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "purchase_items auth all" ON public.purchase_items;
CREATE POLICY "purchase_items tenant" ON public.purchase_items FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "purchase_returns auth all" ON public.purchase_returns;
CREATE POLICY "purchase_returns tenant" ON public.purchase_returns FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "pri auth all" ON public.purchase_return_items;
CREATE POLICY "purchase_return_items tenant" ON public.purchase_return_items FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "sales auth all" ON public.sales;
CREATE POLICY "sales tenant" ON public.sales FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "sale_items auth all" ON public.sale_items;
CREATE POLICY "sale_items tenant" ON public.sale_items FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "sales_returns auth all" ON public.sales_returns;
CREATE POLICY "sales_returns tenant" ON public.sales_returns FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "sri auth all" ON public.sales_return_items;
CREATE POLICY "sales_return_items tenant" ON public.sales_return_items FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "cust_pay auth all" ON public.customer_payments;
CREATE POLICY "customer_payments tenant" ON public.customer_payments FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "supp_pay auth all" ON public.supplier_payments;
CREATE POLICY "supplier_payments tenant" ON public.supplier_payments FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "invtxn auth all" ON public.inventory_transactions;
CREATE POLICY "inventory_transactions tenant" ON public.inventory_transactions FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "stock_adj auth all" ON public.stock_adjustments;
CREATE POLICY "stock_adjustments tenant" ON public.stock_adjustments FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "audit read" ON public.audit_logs;
DROP POLICY "audit insert" ON public.audit_logs;
CREATE POLICY "audit read tenant" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));
CREATE POLICY "audit insert tenant" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (business_id IS NULL OR public.can_access_business(business_id));

DROP POLICY "Authenticated users can read catalog images" ON public.catalog_images;
DROP POLICY "Authenticated users can add catalog images" ON public.catalog_images;
DROP POLICY "Authenticated users can update catalog images" ON public.catalog_images;
DROP POLICY "Authenticated users can delete catalog images" ON public.catalog_images;
CREATE POLICY "catalog_images tenant" ON public.catalog_images FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

DROP POLICY "profiles read" ON public.profiles;
CREATE POLICY "profiles read tenant" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin() OR public.can_access_business(business_id));

DROP POLICY "roles readable" ON public.user_roles;
CREATE POLICY "roles readable tenant" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR public.can_access_business(business_id));

-- ============ 8. NEW USER HANDLING ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt INT; v_bid uuid;
BEGIN
  v_bid := NULLIF(NEW.raw_user_meta_data->>'business_id','')::uuid;
  INSERT INTO public.profiles (id, full_name, email, business_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, v_bid);
  SELECT count(*) INTO cnt FROM public.user_roles;
  IF cnt = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin'::public.app_role);
  END IF;
  RETURN NEW;
END; $$;

-- ============ 9. BUSINESS-AWARE RPCs ============
CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id uuid, p_qty numeric, p_reason text, p_notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev NUMERIC; v_id UUID; v_bid uuid; v_pbid uuid;
BEGIN
  v_bid := public.current_business_id();
  SELECT current_stock, business_id INTO v_prev, v_pbid FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_pbid IS NULL OR NOT public.can_access_business(v_pbid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  INSERT INTO public.inventory_transactions (business_id, product_id, txn_type, reference_type, qty_in, qty_out, notes, created_by)
  VALUES (v_pbid, p_product_id, 'adjustment', 'adjustment', GREATEST(p_qty,0), GREATEST(-p_qty,0), p_reason, auth.uid());
  INSERT INTO public.stock_adjustments (business_id, product_id, previous_stock, adjustment_qty, new_stock, reason, notes, created_by)
  VALUES (v_pbid, p_product_id, v_prev, p_qty, v_prev + p_qty, p_reason, p_notes, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_purchase(p_supplier_id uuid, p_purchase_date date, p_due_date date, p_items jsonb, p_paid_amount numeric, p_notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_no TEXT; v_seq INT; it JSONB; v_bid uuid; v_pbid uuid;
  v_qty NUMERIC; v_rate NUMERIC; v_disc NUMERIC; v_gst NUMERIC;
  v_base NUMERIC; v_tax NUMERIC;
  v_sub NUMERIC := 0; v_disct NUMERIC := 0; v_taxt NUMERIC := 0; v_grand NUMERIC;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND business_id = v_bid) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(purchase_no,'\D','','g'),'')::BIGINT),0)::INT + 1 INTO v_seq
  FROM public.purchases WHERE business_id = v_bid;
  v_no := 'PUR-' || lpad(v_seq::TEXT, 6, '0');

  INSERT INTO public.purchases (id, business_id, purchase_no, supplier_id, purchase_date, due_date, notes, created_by)
  VALUES (v_id, v_bid, v_no, p_supplier_id, COALESCE(p_purchase_date, CURRENT_DATE), p_due_date, p_notes, auth.uid());

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

    INSERT INTO public.inventory_transactions (business_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_in, unit_cost, created_by)
    VALUES (v_bid, (it->>'product_id')::UUID, 'purchase', 'purchase', v_id, v_no, v_qty, v_rate, auth.uid());

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
END; $$;

CREATE OR REPLACE FUNCTION public.create_sale(p_customer_id uuid, p_customer_name text, p_items jsonb, p_invoice_discount numeric, p_payments jsonb, p_notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.business_settings%ROWTYPE;
  v_sale_id UUID := gen_random_uuid();
  v_invoice_no TEXT; v_seq INT; v_bid uuid;
  it JSONB; pay JSONB;
  v_prod public.products%ROWTYPE;
  v_qty NUMERIC; v_rate NUMERIC; v_disc NUMERIC; v_gst NUMERIC;
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

  SELECT * INTO v_settings FROM public.business_settings WHERE business_id = v_bid LIMIT 1;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_no,'\D','','g'),'')::BIGINT),0)::INT INTO v_seq
  FROM public.sales WHERE business_id = v_bid;
  v_seq := GREATEST(v_seq + 1, COALESCE(v_settings.invoice_start_number,1));
  v_invoice_no := COALESCE(v_settings.invoice_prefix,'INV') || '-' || to_char(now(),'YYYY') || '-' || lpad(v_seq::TEXT, 6, '0');

  INSERT INTO public.sales (id, business_id, invoice_no, customer_id, customer_name, notes, created_by)
  VALUES (v_sale_id, v_bid, v_invoice_no, p_customer_id, COALESCE(p_customer_name,'Walk-in Customer'), p_notes, auth.uid());

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = (it->>'product_id')::UUID FOR UPDATE;
    IF NOT FOUND OR v_prod.business_id IS DISTINCT FROM v_bid THEN RAISE EXCEPTION 'Product not found'; END IF;
    v_qty := (it->>'quantity')::NUMERIC;
    v_rate := (it->>'rate')::NUMERIC;
    v_disc := COALESCE((it->>'discount')::NUMERIC,0);
    v_gst := COALESCE((it->>'gst_rate')::NUMERIC, v_prod.gst_rate);
    IF NOT COALESCE(v_settings.allow_negative_stock,false) AND v_prod.current_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for %: available %, requested %', v_prod.name, v_prod.current_stock, v_qty;
    END IF;
    v_line_base := (v_qty * v_rate) - v_disc;
    IF v_prod.tax_inclusive THEN
      v_taxable := round(v_line_base / (1 + v_gst/100), 2);
    ELSE
      v_taxable := round(v_line_base, 2);
    END IF;
    v_tax := round(v_taxable * v_gst / 100, 2);

    INSERT INTO public.sale_items (business_id, sale_id, product_id, product_name, hsn_code, quantity, rate, discount, gst_rate, tax_amount, taxable_amount, total, cost_price)
    VALUES (v_bid, v_sale_id, v_prod.id, v_prod.name, v_prod.hsn_code, v_qty, v_rate, v_disc, v_gst, v_tax, v_taxable, v_taxable + v_tax, v_prod.purchase_price);

    INSERT INTO public.inventory_transactions (business_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_out, unit_cost, created_by)
    VALUES (v_bid, v_prod.id, 'sale', 'sale', v_sale_id, v_invoice_no, v_qty, v_prod.purchase_price, auth.uid());

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
  VALUES (v_bid, auth.uid(), 'Sales', 'Invoice Created', v_invoice_no, jsonb_build_object('total', v_grand));

  RETURN v_sale_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_sales_return(p_sale_id uuid, p_items jsonb, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid(); v_no TEXT; v_seq INT; it JSONB; v_bid uuid;
  v_item public.sale_items%ROWTYPE; v_qty NUMERIC; v_amt NUMERIC := 0; v_cust UUID;
BEGIN
  SELECT customer_id, business_id INTO v_cust, v_bid FROM public.sales WHERE id = p_sale_id;
  IF v_bid IS NULL OR NOT public.can_access_business(v_bid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT COALESCE(count(*),0)::INT + 1 INTO v_seq FROM public.sales_returns WHERE business_id = v_bid;
  v_no := 'SR-' || lpad(v_seq::TEXT, 6, '0');
  INSERT INTO public.sales_returns (id, business_id, return_no, sale_id, customer_id, reason, created_by)
  VALUES (v_id, v_bid, v_no, p_sale_id, v_cust, p_reason, auth.uid());

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
    INSERT INTO public.inventory_transactions (business_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_in, unit_cost, created_by)
    VALUES (v_bid, v_item.product_id, 'sales_return', 'sales_return', v_id, v_no, v_qty, v_item.cost_price, auth.uid());
    v_amt := v_amt + (v_qty * v_item.rate);
  END LOOP;

  UPDATE public.sales_returns SET total_amount = v_amt WHERE id = v_id;
  IF v_cust IS NOT NULL THEN UPDATE public.customers SET balance = balance - v_amt WHERE id = v_cust; END IF;
  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_bid, auth.uid(), 'Sales Return', 'Return Created', v_no, jsonb_build_object('amount', v_amt));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_purchase_return(p_purchase_id uuid, p_items jsonb, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := gen_random_uuid(); v_no TEXT; v_seq INT; it JSONB; v_bid uuid;
  v_item public.purchase_items%ROWTYPE; v_qty NUMERIC; v_amt NUMERIC := 0; v_supp UUID;
BEGIN
  SELECT supplier_id, business_id INTO v_supp, v_bid FROM public.purchases WHERE id = p_purchase_id;
  IF v_bid IS NULL OR NOT public.can_access_business(v_bid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT COALESCE(count(*),0)::INT + 1 INTO v_seq FROM public.purchase_returns WHERE business_id = v_bid;
  v_no := 'PR-' || lpad(v_seq::TEXT, 6, '0');
  INSERT INTO public.purchase_returns (id, business_id, return_no, purchase_id, supplier_id, reason, created_by)
  VALUES (v_id, v_bid, v_no, p_purchase_id, v_supp, p_reason, auth.uid());

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_item FROM public.purchase_items WHERE id = (it->>'purchase_item_id')::UUID AND purchase_id = p_purchase_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid purchase item'; END IF;
    v_qty := (it->>'quantity')::NUMERIC;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_item.returned_qty + v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'Cannot return more than purchased quantity';
    END IF;
    UPDATE public.purchase_items SET returned_qty = returned_qty + v_qty WHERE id = v_item.id;
    INSERT INTO public.purchase_return_items (business_id, return_id, purchase_item_id, product_id, quantity, rate, amount)
    VALUES (v_bid, v_id, v_item.id, v_item.product_id, v_qty, v_item.rate, v_qty * v_item.rate);
    INSERT INTO public.inventory_transactions (business_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_out, unit_cost, created_by)
    VALUES (v_bid, v_item.product_id, 'purchase_return', 'purchase_return', v_id, v_no, v_qty, v_item.rate, auth.uid());
    v_amt := v_amt + (v_qty * v_item.rate);
  END LOOP;

  UPDATE public.purchase_returns SET total_amount = v_amt WHERE id = v_id;
  IF v_supp IS NOT NULL THEN UPDATE public.suppliers SET balance = balance - v_amt WHERE id = v_supp; END IF;
  RETURN v_id;
END; $$;