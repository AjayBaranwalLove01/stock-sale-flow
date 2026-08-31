REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_purchase(uuid, date, date, jsonb, numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_purchase_return(uuid, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_sale(uuid, text, jsonb, numeric, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_sales_return(uuid, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_product_stock() FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase(uuid, date, date, jsonb, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_return(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, text, jsonb, numeric, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_return(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;