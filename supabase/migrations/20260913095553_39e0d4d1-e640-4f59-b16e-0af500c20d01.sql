REVOKE EXECUTE ON FUNCTION
  public.create_sale(uuid, text, jsonb, numeric, jsonb, text, uuid),
  public.create_credit_sale(uuid, jsonb, numeric, date, text, uuid),
  public.create_purchase(uuid, date, date, jsonb, numeric, text, uuid),
  public.create_sales_return(uuid, jsonb, text, uuid),
  public.create_purchase_return(uuid, jsonb, text, uuid),
  public.adjust_stock(uuid, numeric, text, text, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.create_sale(uuid, text, jsonb, numeric, jsonb, text, uuid),
  public.create_credit_sale(uuid, jsonb, numeric, date, text, uuid),
  public.create_purchase(uuid, date, date, jsonb, numeric, text, uuid),
  public.create_sales_return(uuid, jsonb, text, uuid),
  public.create_purchase_return(uuid, jsonb, text, uuid),
  public.adjust_stock(uuid, numeric, text, text, uuid)
TO authenticated;

-- Remove the pre-warehouse overloads so there is exactly one version of each action.
DROP FUNCTION IF EXISTS public.create_sale(uuid, text, jsonb, numeric, jsonb, text);
DROP FUNCTION IF EXISTS public.create_credit_sale(uuid, jsonb, numeric, date, text);
DROP FUNCTION IF EXISTS public.create_purchase(uuid, date, date, jsonb, numeric, text);
DROP FUNCTION IF EXISTS public.create_sales_return(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.create_purchase_return(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, numeric, text, text);