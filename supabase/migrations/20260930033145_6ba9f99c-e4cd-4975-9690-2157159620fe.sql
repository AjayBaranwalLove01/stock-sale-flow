-- product_categories: keep storefront reads, scoped to businesses with an active customer site
DROP POLICY "Public can read product categories" ON public.product_categories;
CREATE POLICY "Public can read product categories" ON public.product_categories
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.storefront_businesses b WHERE b.id = business_id
  ));

-- features: signed-in staff only
DROP POLICY "features readable" ON public.features;
CREATE POLICY "features readable" ON public.features
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- business_features: tenant-scoped read
DROP POLICY "business_features readable" ON public.business_features;
CREATE POLICY "business_features readable" ON public.business_features
  FOR SELECT TO authenticated
  USING (can_access_business(business_id) OR is_super_admin());

-- storage: bind catalog-images objects to their owner / same-business staff
DROP POLICY "Authenticated can upload catalog images" ON storage.objects;
CREATE POLICY "Authenticated can upload catalog images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'catalog-images'
    AND owner_id = (select auth.uid())::text
    AND (storage.foldername(name))[1] IN ('products', 'categories', 'purchase-receipts')
  );

DROP POLICY "Authenticated can view catalog images" ON storage.objects;
CREATE POLICY "Authenticated can view catalog images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'catalog-images'
    AND (
      owner_id = (select auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.profiles me
        JOIN public.profiles ow ON ow.business_id = me.business_id
        WHERE me.id = auth.uid() AND ow.id = storage.objects.owner_id::uuid
      )
    )
  );

DROP POLICY "Authenticated can update catalog images" ON storage.objects;
CREATE POLICY "Authenticated can update catalog images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'catalog-images'
    AND (
      owner_id = (select auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.profiles me
        JOIN public.profiles ow ON ow.business_id = me.business_id
        WHERE me.id = auth.uid() AND ow.id = storage.objects.owner_id::uuid
      )
    )
  )
  WITH CHECK (
    bucket_id = 'catalog-images'
    AND owner_id = (select auth.uid())::text
    AND (storage.foldername(name))[1] IN ('products', 'categories', 'purchase-receipts')
  );

DROP POLICY "Authenticated can delete catalog images" ON storage.objects;
CREATE POLICY "Authenticated can delete catalog images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'catalog-images'
    AND (
      owner_id = (select auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.profiles me
        JOIN public.profiles ow ON ow.business_id = me.business_id
        WHERE me.id = auth.uid() AND ow.id = storage.objects.owner_id::uuid
      )
    )
  );