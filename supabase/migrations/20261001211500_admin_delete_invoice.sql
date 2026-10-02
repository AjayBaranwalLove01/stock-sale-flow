-- Migration: Admin-Only Delete Invoice
-- 1. Updates RLS policies on public.sales to restrict DELETE strictly to Admins and Super Admins
-- 2. Creates atomic stored procedure public.delete_sale_invoice(p_sale_id UUID, p_reason TEXT)
--    with full stock restoration, customer balance reversal, credit removal, payment cleanup, and audit logging.

-- ====================================================================
-- 1. Table-level RLS policy update for sales table
-- ====================================================================
DROP POLICY IF EXISTS "sales tenant" ON public.sales;
DROP POLICY IF EXISTS "sales select tenant" ON public.sales;
DROP POLICY IF EXISTS "sales insert tenant" ON public.sales;
DROP POLICY IF EXISTS "sales update tenant" ON public.sales;
DROP POLICY IF EXISTS "sales delete tenant" ON public.sales;

CREATE POLICY "sales select tenant" ON public.sales FOR SELECT TO authenticated
  USING (public.can_access_business(business_id));

CREATE POLICY "sales insert tenant" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.can_access_business(business_id));

CREATE POLICY "sales update tenant" ON public.sales FOR UPDATE TO authenticated
  USING (public.can_access_business(business_id))
  WITH CHECK (public.can_access_business(business_id));

-- Admin or Super Admin only for delete
CREATE POLICY "sales delete tenant" ON public.sales FOR DELETE TO authenticated
  USING (
    public.can_access_business(business_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  );

-- ====================================================================
-- 2. Stored Procedure: public.delete_sale_invoice
-- ====================================================================
CREATE OR REPLACE FUNCTION public.delete_sale_invoice(
  p_sale_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_credit_txn public.credit_transactions%ROWTYPE;
  v_unpaid NUMERIC;
  v_admin_email TEXT;
  v_admin_name TEXT;
  v_items_count INT := 0;
  v_prod_rec RECORD;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Role check (Admin or Super Admin only)
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Only administrators can delete invoices';
  END IF;

  -- 3. Lock and retrieve sale
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- 4. Multi-business security: must have access to this invoice's business
  IF NOT public.can_access_business(v_sale.business_id) THEN
    RAISE EXCEPTION 'Access denied: You cannot delete invoices belonging to another business';
  END IF;

  -- 5. Sales return check: cannot delete if returns exist
  IF EXISTS (SELECT 1 FROM public.sales_returns WHERE sale_id = p_sale_id) THEN
    RAISE EXCEPTION 'Cannot delete invoice % because it has associated sales returns. Please delete or resolve sales returns first.', v_sale.invoice_no;
  END IF;

  -- 6. Credit and Udhar handling
  SELECT * INTO v_credit_txn FROM public.credit_transactions WHERE sale_id = p_sale_id FOR UPDATE;
  IF FOUND THEN
    -- Check if approved collections exist against this credit transaction
    IF EXISTS (
      SELECT 1 FROM public.credit_collection_entries
      WHERE credit_transaction_id = v_credit_txn.id AND status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Cannot delete invoice % because approved payment collections have already been recorded against it.', v_sale.invoice_no;
    END IF;

    -- Clean up pending/rejected collection audit logs and entries
    DELETE FROM public.credit_collection_audit_logs WHERE credit_transaction_id = v_credit_txn.id;
    DELETE FROM public.credit_collection_entries WHERE credit_transaction_id = v_credit_txn.id;
    DELETE FROM public.credit_transactions WHERE id = v_credit_txn.id;
  END IF;

  -- 7. Reverse Customer Balance if this was an unpaid or credit sale
  v_unpaid := GREATEST(0, COALESCE(v_sale.grand_total, 0) - COALESCE(v_sale.paid_amount, 0));
  IF v_sale.customer_id IS NOT NULL AND v_unpaid > 0 THEN
    UPDATE public.customers
    SET balance = balance - v_unpaid
    WHERE id = v_sale.customer_id;
  END IF;

  -- 8. Remove direct payment records for this sale
  DELETE FROM public.customer_payments WHERE sale_id = p_sale_id;

  -- 9. Remove inventory transactions and restore stock quantities
  -- First identify all affected products and warehouse locations
  CREATE TEMP TABLE _deleted_sale_prods ON COMMIT DROP AS
    SELECT DISTINCT product_id, warehouse_id
    FROM public.inventory_transactions
    WHERE reference_id = p_sale_id AND (reference_type = 'sale' OR txn_type = 'sale');

  -- Delete inventory movements for this sale (triggers sync_product_stock on DELETE)
  DELETE FROM public.inventory_transactions
  WHERE reference_id = p_sale_id AND (reference_type = 'sale' OR txn_type = 'sale');

  -- Re-calculate and ensure stock values are strictly in sync
  FOR v_prod_rec IN SELECT product_id, warehouse_id FROM _deleted_sale_prods LOOP
    UPDATE public.products p
    SET current_stock = COALESCE((
      SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions WHERE product_id = v_prod_rec.product_id
    ), 0)
    WHERE p.id = v_prod_rec.product_id;

    IF v_prod_rec.warehouse_id IS NOT NULL THEN
      INSERT INTO public.warehouse_stock (business_id, warehouse_id, product_id, quantity)
      VALUES (v_sale.business_id, v_prod_rec.warehouse_id, v_prod_rec.product_id, COALESCE((
        SELECT SUM(qty_in - qty_out) FROM public.inventory_transactions
        WHERE product_id = v_prod_rec.product_id AND warehouse_id = v_prod_rec.warehouse_id
      ), 0))
      ON CONFLICT (warehouse_id, product_id) DO UPDATE
        SET quantity = EXCLUDED.quantity, updated_at = now();
    END IF;
  END LOOP;

  -- 10. Count items and delete sale items
  SELECT count(*) INTO v_items_count FROM public.sale_items WHERE sale_id = p_sale_id;
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;

  -- 11. Delete WhatsApp and send history records
  DELETE FROM public.invoice_send_history WHERE sale_id = p_sale_id;

  -- 12. Create permanent Audit Trail record before deleting the sale
  SELECT email, full_name INTO v_admin_email, v_admin_name FROM public.profiles WHERE id = auth.uid();
  IF v_admin_email IS NULL THEN
    SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();
  END IF;

  INSERT INTO public.audit_logs (
    business_id,
    user_id,
    user_email,
    module,
    action,
    record_id,
    old_value,
    new_value
  ) VALUES (
    v_sale.business_id,
    auth.uid(),
    v_admin_email,
    'Sales',
    'Invoice Deleted by Admin',
    v_sale.invoice_no,
    jsonb_build_object(
      'invoice_id', v_sale.id,
      'invoice_no', v_sale.invoice_no,
      'customer_id', v_sale.customer_id,
      'customer_name', v_sale.customer_name,
      'grand_total', v_sale.grand_total,
      'paid_amount', v_sale.paid_amount,
      'invoice_date', v_sale.invoice_date,
      'items_count', v_items_count
    ),
    jsonb_build_object(
      'reason', COALESCE(p_reason, 'Deleted by Admin'),
      'deleted_by_user_id', auth.uid(),
      'deleted_by_name', COALESCE(v_admin_name, v_admin_email, 'Admin'),
      'deleted_by_email', v_admin_email,
      'deleted_at', now()
    )
  );

  -- 13. Finally, delete the sale itself
  DELETE FROM public.sales WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_no', v_sale.invoice_no,
    'customer_name', v_sale.customer_name,
    'grand_total', v_sale.grand_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_sale_invoice(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_sale_invoice(UUID, TEXT) TO authenticated, service_role;
