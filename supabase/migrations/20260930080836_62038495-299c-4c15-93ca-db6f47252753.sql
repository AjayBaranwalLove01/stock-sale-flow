CREATE POLICY "Public can view catalog product and category images"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'catalog-images' AND (storage.foldername(name))[1] IN ('products','categories'));