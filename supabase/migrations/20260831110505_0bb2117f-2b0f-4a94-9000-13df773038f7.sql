REVOKE EXECUTE ON FUNCTION public.is_feature_enabled(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(uuid, text) TO authenticated;