-- 1. Enum additions (used by later migration)
ALTER TYPE public.inv_txn_type ADD VALUE IF NOT EXISTS 'transfer_in';
ALTER TYPE public.inv_txn_type ADD VALUE IF NOT EXISTS 'transfer_out';

-- 2. Warehouses / locations
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  type text NOT NULL DEFAULT 'SHOP' CHECK (type IN ('SHOP','GODOWN','WAREHOUSE','BRANCH')),
  address text,
  contact_person text,
  phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_business_code_uidx ON public.warehouses(business_id, lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default_uidx ON public.warehouses(business_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS warehouses_business_active_idx ON public.warehouses(business_id, is_active);

GRANT SELECT, INSERT, UPDATE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own business warehouses" ON public.warehouses FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));
CREATE POLICY "Staff create warehouses" ON public.warehouses FOR INSERT TO authenticated
  WITH CHECK (public.can_access_business(business_id) AND public.is_staff()
    AND public.is_feature_enabled(business_id, 'godown_management'));
CREATE POLICY "Staff update warehouses" ON public.warehouses FOR UPDATE TO authenticated
  USING (public.can_access_business(business_id) AND public.is_staff())
  WITH CHECK (public.can_access_business(business_id) AND public.is_staff());

CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Per-user location access
CREATE TABLE IF NOT EXISTS public.user_warehouse_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, warehouse_id)
);
CREATE INDEX IF NOT EXISTS uwa_business_user_idx ON public.user_warehouse_access(business_id, user_id);
GRANT SELECT, INSERT, DELETE ON public.user_warehouse_access TO authenticated;
GRANT ALL ON public.user_warehouse_access TO service_role;
ALTER TABLE public.user_warehouse_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read location access" ON public.user_warehouse_access FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));
CREATE POLICY "Admins grant location access" ON public.user_warehouse_access FOR INSERT TO authenticated
  WITH CHECK (public.can_access_business(business_id)
    AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin()));
CREATE POLICY "Admins revoke location access" ON public.user_warehouse_access FOR DELETE TO authenticated
  USING (public.can_access_business(business_id)
    AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin()));

-- 4. Location-wise stock (derived cache over inventory_transactions)
CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  reserved_quantity numeric NOT NULL DEFAULT 0,
  minimum_stock numeric NOT NULL DEFAULT 0,
  reorder_quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);
CREATE INDEX IF NOT EXISTS warehouse_stock_biz_idx ON public.warehouse_stock(business_id, product_id);
GRANT SELECT, UPDATE ON public.warehouse_stock TO authenticated;
GRANT ALL ON public.warehouse_stock TO service_role;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own stock" ON public.warehouse_stock FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));
CREATE POLICY "Staff set stock levels" ON public.warehouse_stock FOR UPDATE TO authenticated
  USING (public.can_access_business(business_id) AND public.is_staff())
  WITH CHECK (public.can_access_business(business_id) AND public.is_staff());
CREATE TRIGGER update_warehouse_stock_updated_at BEFORE UPDATE ON public.warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Stock transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  transfer_number text NOT NULL,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING','APPROVED','DISPATCHED','RECEIVED','COMPLETED','CANCELLED')),
  requested_by uuid, approved_by uuid, dispatched_by uuid, received_by uuid,
  requested_at timestamptz, approved_at timestamptz, dispatched_at timestamptz,
  received_at timestamptz, completed_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfers_distinct_locations CHECK (from_warehouse_id <> to_warehouse_id),
  UNIQUE (business_id, transfer_number)
);
CREATE INDEX IF NOT EXISTS stock_transfers_biz_idx ON public.stock_transfers(business_id, status, created_at DESC);
GRANT SELECT ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own transfers" ON public.stock_transfers FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  requested_qty numeric NOT NULL CHECK (requested_qty > 0),
  sent_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sti_transfer_idx ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS sti_product_idx ON public.stock_transfer_items(product_id);
GRANT SELECT ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own transfer items" ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));

-- 6. warehouse_id on existing document + movement tables
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
CREATE INDEX IF NOT EXISTS inv_txn_wh_product_idx ON public.inventory_transactions(warehouse_id, product_id, txn_date);

-- 7. Feature registration (off per business until Super Admin enables)
INSERT INTO public.features (key, name, description, category, enabled_globally)
VALUES ('godown_management','Godown / Warehouse Management',
  'Multiple stock locations, location-wise stock and stock transfers.','Inventory', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.business_features (business_id, feature_key, enabled)
SELECT b.id, 'godown_management', false FROM public.businesses b
ON CONFLICT DO NOTHING;

-- 8. Main Shop for every existing business + map existing stock/history
INSERT INTO public.warehouses (business_id, name, code, type, is_default, is_active)
SELECT b.id, 'Main Shop', 'MAIN', 'SHOP', true, true
FROM public.businesses b
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.business_id = b.id);

UPDATE public.inventory_transactions t SET warehouse_id = w.id
FROM public.warehouses w WHERE w.business_id = t.business_id AND w.is_default AND t.warehouse_id IS NULL;
UPDATE public.sales t SET warehouse_id = w.id
FROM public.warehouses w WHERE w.business_id = t.business_id AND w.is_default AND t.warehouse_id IS NULL;
UPDATE public.purchases t SET warehouse_id = w.id
FROM public.warehouses w WHERE w.business_id = t.business_id AND w.is_default AND t.warehouse_id IS NULL;
UPDATE public.sales_returns t SET warehouse_id = w.id
FROM public.warehouses w WHERE w.business_id = t.business_id AND w.is_default AND t.warehouse_id IS NULL;
UPDATE public.purchase_returns t SET warehouse_id = w.id
FROM public.warehouses w WHERE w.business_id = t.business_id AND w.is_default AND t.warehouse_id IS NULL;
UPDATE public.stock_adjustments t SET warehouse_id = w.id
FROM public.warehouses w WHERE w.business_id = t.business_id AND w.is_default AND t.warehouse_id IS NULL;
UPDATE public.orders t SET warehouse_id = w.id
FROM public.warehouses w WHERE w.business_id = t.business_id AND w.is_default AND t.warehouse_id IS NULL;

-- 9. Build the location-stock cache from the existing movement ledger (no duplication)
INSERT INTO public.warehouse_stock (business_id, warehouse_id, product_id, quantity)
SELECT t.business_id, t.warehouse_id, t.product_id, SUM(t.qty_in - t.qty_out)
FROM public.inventory_transactions t
WHERE t.warehouse_id IS NOT NULL
GROUP BY t.business_id, t.warehouse_id, t.product_id
ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- 10. Keep both caches in sync from the single movement ledger
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pid UUID; wid UUID; bid UUID;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  wid := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  bid := COALESCE(NEW.business_id, OLD.business_id);

  UPDATE public.products p SET current_stock = COALESCE((
    SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions WHERE product_id = pid
  ),0) WHERE p.id = pid;

  IF wid IS NOT NULL THEN
    INSERT INTO public.warehouse_stock (business_id, warehouse_id, product_id, quantity)
    VALUES (bid, wid, pid, COALESCE((
      SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions
      WHERE product_id = pid AND warehouse_id = wid),0))
    ON CONFLICT (warehouse_id, product_id) DO UPDATE
      SET quantity = EXCLUDED.quantity, updated_at = now();
  END IF;
  RETURN NULL;
END; $function$;