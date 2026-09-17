CREATE TABLE public.product_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_unique UNIQUE (business_id, product_id, category_id)
);

CREATE INDEX product_categories_product_idx ON public.product_categories (product_id);
CREATE INDEX product_categories_category_idx ON public.product_categories (category_id);
CREATE INDEX product_categories_business_idx ON public.product_categories (business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT SELECT ON public.product_categories TO anon;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business users manage their product categories"
  ON public.product_categories FOR ALL TO authenticated
  USING (public.can_access_business(business_id))
  WITH CHECK (public.can_access_business(business_id));

CREATE POLICY "Public can read product categories"
  ON public.product_categories FOR SELECT TO anon
  USING (true);

CREATE TRIGGER update_product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing single-category assignments
INSERT INTO public.product_categories (business_id, product_id, category_id)
SELECT business_id, id, category_id FROM public.products
ON CONFLICT DO NOTHING;

-- Keep the primary category mirrored into the mapping table
CREATE OR REPLACE FUNCTION public.sync_primary_product_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_categories (business_id, product_id, category_id)
  VALUES (NEW.business_id, NEW.id, NEW.category_id)
  ON CONFLICT (business_id, product_id, category_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_sync_primary_category
  AFTER INSERT OR UPDATE OF category_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_product_category();