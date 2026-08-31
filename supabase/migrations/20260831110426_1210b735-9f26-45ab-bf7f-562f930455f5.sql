-- ============ ACCOUNT TYPE SEPARATION ============
ALTER TABLE public.profiles ADD COLUMN account_type text NOT NULL DEFAULT 'staff'
  CHECK (account_type IN ('staff','customer'));

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'staff');
$$;

CREATE OR REPLACE FUNCTION public.can_access_business(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'staff') THEN false
    WHEN public.is_super_admin() THEN
      COALESCE((SELECT active_business_id FROM public.profiles WHERE id = auth.uid()), _business_id) = _business_id
    ELSE _business_id IS NOT NULL
      AND _business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ============ FEATURES ============
CREATE TABLE public.features (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  depends_on text REFERENCES public.features(key),
  enabled_globally boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.features TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.features TO authenticated;
GRANT ALL ON public.features TO service_role;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "features readable" ON public.features FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "features managed by super admin" ON public.features FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER trg_features_updated BEFORE UPDATE ON public.features
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.business_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, feature_key)
);
GRANT SELECT ON public.business_features TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.business_features TO authenticated;
GRANT ALL ON public.business_features TO service_role;
ALTER TABLE public.business_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_features readable" ON public.business_features FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "business_features managed by super admin" ON public.business_features FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER trg_business_features_updated BEFORE UPDATE ON public.business_features
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.features (key, name, description, category, depends_on) VALUES
  ('storefront','Customer Storefront','Public e-commerce website for the business','Storefront',NULL),
  ('promotions','Promotions & Offers','Banners, discounts and offers','Storefront','storefront'),
  ('online_orders','Online Orders','Customers can place orders from the storefront','Storefront','storefront'),
  ('reports','Reports & Analytics','Sales, stock and GST reporting','Back office',NULL),
  ('purchases','Purchases','Supplier purchase entry and returns','Back office',NULL),
  ('audit_log','Audit Log','Track every change made in the system','Back office',NULL);

CREATE OR REPLACE FUNCTION public.is_feature_enabled(_business_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE chain AS (
    SELECT f.key, f.depends_on, f.enabled_globally FROM public.features f WHERE f.key = _key
    UNION ALL
    SELECT p.key, p.depends_on, p.enabled_globally FROM public.features p JOIN chain c ON p.key = c.depends_on
  )
  SELECT COALESCE(bool_and(
    c.enabled_globally
    AND COALESCE((SELECT bf.enabled FROM public.business_features bf
                  WHERE bf.business_id = _business_id AND bf.feature_key = c.key), true)
  ), false) FROM chain c;
$$;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(uuid, text) TO authenticated, anon;

-- ============ STOREFRONT CUSTOMER ACCOUNTS ============
ALTER TABLE public.customers
  ADD COLUMN auth_user_id uuid UNIQUE,
  ADD COLUMN source text NOT NULL DEFAULT 'back_office';

CREATE POLICY "customers own record" ON public.customers FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- ============ PROMOTIONS ============
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL DEFAULT public.current_business_id() REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  banner_url text,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','flat','none')),
  discount_value numeric NOT NULL DEFAULT 0,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promotions tenant" ON public.promotions FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));
CREATE TRIGGER trg_promotions_updated BEFORE UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  shipping_address text,
  shipping_city text,
  shipping_state text,
  shipping_pincode text,
  payment_mode text NOT NULL DEFAULT 'cod',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','packed','shipped','delivered','cancelled')),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  notes text,
  placed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, order_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders tenant" ON public.orders FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));
CREATE POLICY "orders own customer read" ON public.orders FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()));
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  rate numeric NOT NULL,
  gst_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items tenant" ON public.order_items FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));
CREATE POLICY "order_items own customer read" ON public.order_items FOR SELECT TO authenticated
  USING (order_id IN (SELECT o.id FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id WHERE c.auth_user_id = auth.uid()));

CREATE INDEX idx_orders_business ON public.orders(business_id);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_promotions_business ON public.promotions(business_id);

-- ============ PUBLIC STOREFRONT VIEWS (safe columns only) ============
CREATE VIEW public.storefront_businesses AS
  SELECT b.id, b.name, b.code, b.subdomain, b.logo_url, b.city, b.state, b.country,
         b.phone, b.email, b.website, b.business_type
  FROM public.businesses b
  WHERE b.status = 'active' AND b.customer_site_enabled
    AND public.is_feature_enabled(b.id, 'storefront');

CREATE VIEW public.storefront_categories AS
  SELECT c.id, c.business_id, c.name, c.code, c.parent_id, c.description,
         c.image_sm, c.image_md, c.image_lg
  FROM public.categories c
  JOIN public.storefront_businesses b ON b.id = c.business_id
  WHERE c.status = 'active';

CREATE VIEW public.storefront_products AS
  SELECT p.id, p.business_id, p.name, p.sku, p.brand, p.description, p.category_id,
         p.selling_price, p.mrp, p.discount, p.gst_rate, p.tax_inclusive, p.unit,
         p.image_sm, p.image_md, p.image_lg,
         (p.current_stock > 0) AS in_stock
  FROM public.products p
  JOIN public.storefront_businesses b ON b.id = p.business_id
  WHERE p.status = 'active';

CREATE VIEW public.storefront_promotions AS
  SELECT pr.id, pr.business_id, pr.title, pr.description, pr.banner_url,
         pr.discount_type, pr.discount_value, pr.category_id, pr.product_id,
         pr.starts_at, pr.ends_at
  FROM public.promotions pr
  JOIN public.storefront_businesses b ON b.id = pr.business_id
  WHERE pr.is_active
    AND pr.starts_at <= now() AND (pr.ends_at IS NULL OR pr.ends_at > now())
    AND public.is_feature_enabled(pr.business_id, 'promotions');

GRANT SELECT ON public.storefront_businesses, public.storefront_categories,
  public.storefront_products, public.storefront_promotions TO anon, authenticated;

-- ============ PLACE ORDER ============
CREATE OR REPLACE FUNCTION public.place_order(
  p_business_id uuid, p_items jsonb, p_name text, p_email text, p_phone text,
  p_address text, p_city text, p_state text, p_pincode text, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := gen_random_uuid(); v_no text; v_seq int; it jsonb;
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

  SELECT id INTO v_cust FROM public.customers
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id;
  IF v_cust IS NULL THEN
    INSERT INTO public.customers (business_id, name, mobile, email, address, city, state, pincode, auth_user_id, source)
    VALUES (p_business_id, COALESCE(p_name,'Customer'), p_phone, p_email, p_address, p_city, p_state, p_pincode, auth.uid(), 'storefront')
    RETURNING id INTO v_cust;
  END IF;

  SELECT COALESCE(count(*),0)::int + 1 INTO v_seq FROM public.orders WHERE business_id = p_business_id;
  v_no := 'ORD-' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.orders (id, business_id, order_no, customer_id, customer_name, customer_email,
    customer_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, notes, placed_by)
  VALUES (v_id, p_business_id, v_no, v_cust, COALESCE(p_name,'Customer'), p_email, p_phone,
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
    IF v_prod.tax_inclusive THEN
      v_taxable := round(v_line / (1 + v_prod.gst_rate/100), 2);
    ELSE
      v_taxable := round(v_line, 2);
    END IF;
    v_tax := round(v_taxable * v_prod.gst_rate / 100, 2);

    INSERT INTO public.order_items (business_id, order_id, product_id, product_name, quantity, rate, gst_rate, tax_amount, total)
    VALUES (p_business_id, v_id, v_prod.id, v_prod.name, v_qty, v_prod.selling_price, v_prod.gst_rate, v_tax, v_taxable + v_tax);

    INSERT INTO public.inventory_transactions (business_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_out, unit_cost, created_by)
    VALUES (p_business_id, v_prod.id, 'sale', 'order', v_id, v_no, v_qty, v_prod.purchase_price, auth.uid());

    v_sub := v_sub + v_taxable;
    v_taxt := v_taxt + v_tax;
  END LOOP;

  IF v_sub = 0 THEN RAISE EXCEPTION 'Your cart is empty'; END IF;
  v_total := round(v_sub + v_taxt, 2);
  UPDATE public.orders SET subtotal = v_sub, tax_amount = v_taxt, grand_total = v_total WHERE id = v_id;

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (p_business_id, auth.uid(), 'Orders', 'Order Placed', v_no, jsonb_build_object('total', v_total));

  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.place_order(uuid,jsonb,text,text,text,text,text,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,jsonb,text,text,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.orders%ROWTYPE; r RECORD;
BEGIN
  SELECT * INTO v_o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_business(v_o.business_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_status NOT IN ('pending','confirmed','packed','shipped','delivered','cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF p_status = 'cancelled' AND v_o.status <> 'cancelled' THEN
    FOR r IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      INSERT INTO public.inventory_transactions (business_id, product_id, txn_type, reference_type, reference_id, reference_no, qty_in, created_by)
      VALUES (v_o.business_id, r.product_id, 'sales_return', 'order_cancel', p_order_id, v_o.order_no, r.quantity, auth.uid());
    END LOOP;
  END IF;
  UPDATE public.orders SET status = p_status WHERE id = p_order_id;
  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_o.business_id, auth.uid(), 'Orders', 'Status Changed', v_o.order_no, jsonb_build_object('status', p_status));
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_order_status(uuid,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid,text) TO authenticated;

-- ============ NEW USER: storefront customers ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt INT; v_bid uuid; v_type text;
BEGIN
  v_bid := NULLIF(NEW.raw_user_meta_data->>'business_id','')::uuid;
  v_type := CASE WHEN NEW.raw_user_meta_data->>'account_type' = 'customer' THEN 'customer' ELSE 'staff' END;
  INSERT INTO public.profiles (id, full_name, email, business_id, account_type)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, v_bid, v_type);
  IF v_type = 'staff' THEN
    SELECT count(*) INTO cnt FROM public.user_roles;
    IF cnt = 0 THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin'::public.app_role);
    END IF;
  END IF;
  IF v_type = 'customer' AND v_bid IS NOT NULL THEN
    INSERT INTO public.customers (business_id, name, email, auth_user_id, source)
    VALUES (v_bid, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''),'Customer'), NEW.email, NEW.id, 'storefront')
    ON CONFLICT (auth_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;