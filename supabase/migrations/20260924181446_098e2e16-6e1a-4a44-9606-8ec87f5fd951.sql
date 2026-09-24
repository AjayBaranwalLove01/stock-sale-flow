CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE pid UUID; wid UUID; bid UUID;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  wid := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  bid := COALESCE(NEW.business_id, OLD.business_id);

  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = pid
  ) THEN
    RETURN NULL;
  END IF;

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

REVOKE ALL ON FUNCTION public.sync_product_stock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_product_stock() TO service_role;