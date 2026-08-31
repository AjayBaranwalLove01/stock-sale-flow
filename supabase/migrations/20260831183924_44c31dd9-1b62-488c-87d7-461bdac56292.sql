
CREATE POLICY "Staff read signage media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signage-media' AND public.is_staff());
CREATE POLICY "Staff upload signage media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signage-media' AND public.is_staff());
CREATE POLICY "Staff update signage media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'signage-media' AND public.is_staff())
  WITH CHECK (bucket_id = 'signage-media' AND public.is_staff());
CREATE POLICY "Staff delete signage media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'signage-media' AND public.is_staff());
