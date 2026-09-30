GRANT SELECT ON public.catalog_images TO anon, authenticated;
CREATE POLICY "Shoppers view storefront product images" ON public.catalog_images
FOR SELECT TO anon, authenticated
USING (entity_type IN ('product','category') AND EXISTS (SELECT 1 FROM public.storefront_businesses b WHERE b.id = catalog_images.business_id));