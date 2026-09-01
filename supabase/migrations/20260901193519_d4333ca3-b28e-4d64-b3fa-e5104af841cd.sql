-- ============ 1. Role + flags ============
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'credit_officer';

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_terms_days INTEGER NOT NULL DEFAULT 15;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_verify_collections BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS default_credit_terms_days INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS credit_block_when_overdue BOOLEAN NOT NULL DEFAULT true;

-- ============ 2. Credit transactions ============
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  sale_id UUID REFERENCES public.sales(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  reference_no TEXT NOT NULL,
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  terms_days INTEGER NOT NULL DEFAULT 15,
  original_amount NUMERIC(14,2) NOT NULL CHECK (original_amount > 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  outstanding_amount NUMERIC(14,2) NOT NULL CHECK (outstanding_amount >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  settled_at TIMESTAMPTZ,
  settled_on_time BOOLEAN,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_txn_status_chk CHECK (status IN ('pending','active','partially_paid','paid','overdue','cancelled')),
  CONSTRAINT credit_txn_paid_chk CHECK (paid_amount <= original_amount),
  CONSTRAINT credit_txn_source_chk CHECK (num_nonnulls(sale_id, order_id) = 1)
);
CREATE INDEX IF NOT EXISTS credit_txn_business_idx ON public.credit_transactions(business_id);
CREATE INDEX IF NOT EXISTS credit_txn_customer_idx ON public.credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS credit_txn_due_idx ON public.credit_transactions(business_id, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS credit_txn_sale_uidx ON public.credit_transactions(sale_id) WHERE sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS credit_txn_order_uidx ON public.credit_transactions(order_id) WHERE order_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage credit transactions of their business"
ON public.credit_transactions FOR ALL TO authenticated
USING (public.can_access_business(business_id))
WITH CHECK (public.can_access_business(business_id));

CREATE POLICY "Shoppers read their own credit transactions"
ON public.credit_transactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.customers c
               WHERE c.id = credit_transactions.customer_id AND c.auth_user_id = auth.uid()));

CREATE TRIGGER trg_credit_txn_updated BEFORE UPDATE ON public.credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. Collection entries ============
CREATE TABLE IF NOT EXISTS public.credit_collection_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  credit_transaction_id UUID NOT NULL REFERENCES public.credit_transactions(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  reference_doc TEXT,
  collection_officer_id UUID REFERENCES auth.users(id),
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  reference_number TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'pending_verification',
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  verification_comments TEXT,
  rejection_reason TEXT,
  payment_id UUID REFERENCES public.customer_payments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT collection_status_chk CHECK (status IN ('pending_verification','approved','rejected','correction_requested'))
);
CREATE INDEX IF NOT EXISTS collection_business_idx ON public.credit_collection_entries(business_id, status);
CREATE INDEX IF NOT EXISTS collection_txn_idx ON public.credit_collection_entries(credit_transaction_id);
CREATE INDEX IF NOT EXISTS collection_officer_idx ON public.credit_collection_entries(collection_officer_id);

GRANT SELECT, INSERT, UPDATE ON public.credit_collection_entries TO authenticated;
GRANT ALL ON public.credit_collection_entries TO service_role;
ALTER TABLE public.credit_collection_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read collections of their business"
ON public.credit_collection_entries FOR SELECT TO authenticated
USING (public.can_access_business(business_id));

-- ============ 4. Immutable audit log ============
CREATE TABLE IF NOT EXISTS public.credit_collection_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  collection_entry_id UUID NOT NULL REFERENCES public.credit_collection_entries(id) ON DELETE RESTRICT,
  credit_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  previous_status TEXT,
  new_status TEXT,
  amount NUMERIC(14,2),
  payment_method TEXT,
  reference_number TEXT,
  remarks TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collection_audit_entry_idx ON public.credit_collection_audit_logs(collection_entry_id);

GRANT SELECT ON public.credit_collection_audit_logs TO authenticated;
GRANT ALL ON public.credit_collection_audit_logs TO service_role;
ALTER TABLE public.credit_collection_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read collection audit of their business"
ON public.credit_collection_audit_logs FOR SELECT TO authenticated
USING (public.can_access_business(business_id));

-- ============ 5. Helpers ============
CREATE OR REPLACE FUNCTION public.is_credit_officer()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = auth.uid() AND role::text = 'credit_officer');
END; $$;

CREATE OR REPLACE FUNCTION public.can_verify_collections()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'admin')
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND can_verify_collections);
END; $$;

CREATE OR REPLACE FUNCTION public.refresh_credit_status(p_txn_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.credit_transactions%ROWTYPE; v_status text;
BEGIN
  SELECT * INTO t FROM public.credit_transactions WHERE id = p_txn_id;
  IF NOT FOUND OR t.status = 'cancelled' THEN RETURN; END IF;
  IF t.outstanding_amount <= 0 THEN
    v_status := 'paid';
  ELSIF t.due_date < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSIF t.paid_amount > 0 THEN
    v_status := 'partially_paid';
  ELSE
    v_status := 'active';
  END IF;
  UPDATE public.credit_transactions SET status = v_status WHERE id = p_txn_id;
END; $$;

-- ============ 6. Credit sale (staff POS) ============
CREATE OR REPLACE FUNCTION public.create_credit_sale(
  p_customer_id uuid, p_items jsonb, p_invoice_discount numeric,
  p_due_date date DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_bid uuid; v_sale_id uuid; v_c public.customers%ROWTYPE;
  v_total numeric; v_inv text; v_terms int; v_due date;
  v_out numeric; v_block boolean; v_default int;
BEGIN
  v_bid := public.current_business_id();
  IF v_bid IS NULL THEN RAISE EXCEPTION 'No active business'; END IF;

  SELECT * INTO v_c FROM public.customers WHERE id = p_customer_id AND business_id = v_bid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this business'; END IF;
  IF NOT v_c.credit_allowed THEN
    RAISE EXCEPTION 'Credit purchase is not enabled for %', v_c.name;
  END IF;

  SELECT COALESCE(credit_block_when_overdue, true), COALESCE(default_credit_terms_days, 15)
    INTO v_block, v_default FROM public.business_settings WHERE business_id = v_bid;

  IF COALESCE(v_block, true) AND EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE customer_id = v_c.id AND outstanding_amount > 0
      AND due_date < CURRENT_DATE AND status <> 'cancelled')
  THEN RAISE EXCEPTION 'Customer has overdue credit — settle it before a new credit sale'; END IF;

  v_sale_id := public.create_sale(p_customer_id, v_c.name, p_items,
                                  COALESCE(p_invoice_discount, 0), '[]'::jsonb, p_notes);

  SELECT grand_total, invoice_no INTO v_total, v_inv FROM public.sales WHERE id = v_sale_id;

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_out
    FROM public.credit_transactions WHERE customer_id = v_c.id AND status <> 'cancelled';
  IF v_c.credit_limit > 0 AND (v_out + v_total) > v_c.credit_limit THEN
    RAISE EXCEPTION 'Credit limit exceeded: limit %, already outstanding %, this sale %',
      v_c.credit_limit, v_out, v_total;
  END IF;

  v_terms := GREATEST(COALESCE(NULLIF(v_c.credit_terms_days, 0), COALESCE(v_default, 15)), 1);
  v_due := COALESCE(p_due_date, CURRENT_DATE + v_terms);
  IF v_due < CURRENT_DATE THEN RAISE EXCEPTION 'Due date cannot be in the past'; END IF;

  INSERT INTO public.credit_transactions (business_id, customer_id, sale_id, reference_no,
    credit_date, due_date, terms_days, original_amount, paid_amount, outstanding_amount,
    status, notes, created_by)
  VALUES (v_bid, v_c.id, v_sale_id, v_inv, CURRENT_DATE, v_due,
    (v_due - CURRENT_DATE), v_total, 0, v_total, 'active', p_notes, auth.uid());

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (v_bid, auth.uid(), 'Credit', 'Credit Sale Created', v_inv,
          jsonb_build_object('customer', v_c.name, 'amount', v_total, 'due_date', v_due));

  RETURN v_sale_id;
END; $$;

-- ============ 7. Storefront credit order ============
CREATE OR REPLACE FUNCTION public.place_credit_order(
  p_business_id uuid, p_items jsonb, p_name text, p_email text, p_phone text,
  p_address text, p_city text, p_state text, p_pincode text, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_c public.customers%ROWTYPE; v_order_id uuid; v_total numeric; v_no text;
  v_terms int; v_due date; v_out numeric; v_default int; v_block boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO v_c FROM public.customers
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id;
  IF NOT FOUND OR NOT v_c.credit_allowed THEN
    RAISE EXCEPTION 'Credit purchase is not enabled for your account';
  END IF;

  SELECT COALESCE(credit_block_when_overdue, true), COALESCE(default_credit_terms_days, 15)
    INTO v_block, v_default FROM public.business_settings WHERE business_id = p_business_id;

  IF COALESCE(v_block, true) AND EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE customer_id = v_c.id AND outstanding_amount > 0
      AND due_date < CURRENT_DATE AND status <> 'cancelled')
  THEN RAISE EXCEPTION 'You have an overdue credit balance — please settle it first'; END IF;

  v_order_id := public.place_order(p_business_id, p_items, p_name, p_email, p_phone,
                                   p_address, p_city, p_state, p_pincode, p_notes);
  SELECT grand_total, order_no INTO v_total, v_no FROM public.orders WHERE id = v_order_id;

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_out
    FROM public.credit_transactions WHERE customer_id = v_c.id AND status <> 'cancelled';
  IF v_c.credit_limit > 0 AND (v_out + v_total) > v_c.credit_limit THEN
    RAISE EXCEPTION 'This order exceeds your available credit';
  END IF;

  v_terms := GREATEST(COALESCE(NULLIF(v_c.credit_terms_days, 0), COALESCE(v_default, 15)), 1);
  v_due := CURRENT_DATE + v_terms;

  UPDATE public.orders SET payment_mode = 'credit' WHERE id = v_order_id;
  UPDATE public.customers SET balance = balance + v_total WHERE id = v_c.id;

  INSERT INTO public.credit_transactions (business_id, customer_id, order_id, reference_no,
    credit_date, due_date, terms_days, original_amount, paid_amount, outstanding_amount,
    status, notes, created_by)
  VALUES (p_business_id, v_c.id, v_order_id, v_no, CURRENT_DATE, v_due, v_terms,
    v_total, 0, v_total, 'active', p_notes, auth.uid());

  RETURN v_order_id;
END; $$;

-- ============ 8. Collection entry ============
CREATE OR REPLACE FUNCTION public.record_credit_collection(
  p_credit_transaction_id uuid, p_amount numeric, p_collection_date date,
  p_method text, p_reference text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.credit_transactions%ROWTYPE; v_pending numeric; v_id uuid;
BEGIN
  SELECT * INTO t FROM public.credit_transactions WHERE id = p_credit_transaction_id;
  IF NOT FOUND OR NOT public.can_access_business(t.business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NOT (public.is_credit_officer() OR public.can_verify_collections()) THEN
    RAISE EXCEPTION 'You are not allowed to collect credit payments';
  END IF;
  IF t.status = 'cancelled' THEN RAISE EXCEPTION 'This credit is cancelled'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending FROM public.credit_collection_entries
   WHERE credit_transaction_id = t.id AND status IN ('pending_verification','correction_requested');

  IF p_amount > (t.outstanding_amount - v_pending) THEN
    RAISE EXCEPTION 'Amount exceeds the outstanding balance (% remaining after % awaiting verification)',
      t.outstanding_amount - v_pending, v_pending;
  END IF;

  INSERT INTO public.credit_collection_entries (business_id, credit_transaction_id, customer_id,
    reference_doc, collection_officer_id, collection_date, amount, payment_method,
    reference_number, remarks, status)
  VALUES (t.business_id, t.id, t.customer_id, t.reference_no, auth.uid(),
    COALESCE(p_collection_date, CURRENT_DATE), p_amount, p_method::public.payment_method,
    p_reference, p_remarks, 'pending_verification')
  RETURNING id INTO v_id;

  INSERT INTO public.credit_collection_audit_logs (business_id, collection_entry_id,
    credit_transaction_id, action, actor_id, actor_email, previous_status, new_status,
    amount, payment_method, reference_number, remarks)
  SELECT t.business_id, v_id, t.id, 'created', auth.uid(), p.email, NULL, 'pending_verification',
    p_amount, p_method, p_reference, p_remarks FROM public.profiles p WHERE p.id = auth.uid();

  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.resubmit_credit_collection(
  p_entry_id uuid, p_amount numeric, p_method text,
  p_reference text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.credit_collection_entries%ROWTYPE; t public.credit_transactions%ROWTYPE; v_pending numeric;
BEGIN
  SELECT * INTO e FROM public.credit_collection_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_business(e.business_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF e.status <> 'correction_requested' THEN RAISE EXCEPTION 'Only entries marked for correction can be resubmitted'; END IF;
  IF e.collection_officer_id <> auth.uid() AND NOT public.can_verify_collections() THEN
    RAISE EXCEPTION 'Only the collecting officer can correct this entry';
  END IF;

  SELECT * INTO t FROM public.credit_transactions WHERE id = e.credit_transaction_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_pending FROM public.credit_collection_entries
   WHERE credit_transaction_id = t.id AND status = 'pending_verification';
  IF p_amount <= 0 OR p_amount > (t.outstanding_amount - v_pending) THEN
    RAISE EXCEPTION 'Amount exceeds the outstanding balance';
  END IF;

  UPDATE public.credit_collection_entries
     SET amount = p_amount, payment_method = p_method::public.payment_method,
         reference_number = p_reference, remarks = p_remarks,
         status = 'pending_verification', updated_at = now()
   WHERE id = p_entry_id;

  INSERT INTO public.credit_collection_audit_logs (business_id, collection_entry_id,
    credit_transaction_id, action, actor_id, actor_email, previous_status, new_status,
    amount, payment_method, reference_number, remarks)
  SELECT e.business_id, e.id, e.credit_transaction_id, 'corrected', auth.uid(), p.email,
    'correction_requested', 'pending_verification', p_amount, p_method, p_reference, p_remarks
  FROM public.profiles p WHERE p.id = auth.uid();
END; $$;

-- ============ 9. Verification ============
CREATE OR REPLACE FUNCTION public.verify_credit_collection(
  p_entry_id uuid, p_action text, p_comments text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  e public.credit_collection_entries%ROWTYPE; t public.credit_transactions%ROWTYPE;
  v_new text; v_pay uuid; v_paid numeric; v_out numeric;
BEGIN
  SELECT * INTO e FROM public.credit_collection_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_business(e.business_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT public.can_verify_collections() THEN RAISE EXCEPTION 'You are not authorised to verify collections'; END IF;
  IF e.status NOT IN ('pending_verification') THEN RAISE EXCEPTION 'This entry is already %', e.status; END IF;
  IF p_action NOT IN ('approve','reject','request_correction') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  IF p_action = 'reject' AND COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO t FROM public.credit_transactions WHERE id = e.credit_transaction_id FOR UPDATE;

  IF p_action = 'approve' THEN
    IF e.amount > t.outstanding_amount THEN RAISE EXCEPTION 'Amount exceeds the outstanding balance'; END IF;
    v_new := 'approved';

    INSERT INTO public.customer_payments (business_id, customer_id, sale_id, payment_date,
      amount, method, reference_no, remarks, created_by)
    VALUES (t.business_id, t.customer_id, t.sale_id, e.collection_date::timestamptz,
      e.amount, e.payment_method, e.reference_number,
      COALESCE(e.remarks, '') || ' [credit collection]', e.collection_officer_id)
    RETURNING id INTO v_pay;

    v_paid := t.paid_amount + e.amount;
    v_out := GREATEST(t.original_amount - v_paid, 0);

    UPDATE public.credit_transactions
       SET paid_amount = v_paid, outstanding_amount = v_out,
           settled_at = CASE WHEN v_out <= 0 THEN now() ELSE settled_at END,
           settled_on_time = CASE WHEN v_out <= 0 THEN (e.collection_date <= t.due_date) ELSE settled_on_time END
     WHERE id = t.id;

    IF t.sale_id IS NOT NULL THEN
      UPDATE public.sales SET paid_amount = paid_amount + e.amount WHERE id = t.sale_id;
    END IF;
    UPDATE public.customers SET balance = GREATEST(balance - e.amount, 0) WHERE id = t.customer_id;
    PERFORM public.refresh_credit_status(t.id);

    UPDATE public.credit_collection_entries
       SET status = v_new, verified_by = auth.uid(), verified_at = now(),
           verification_comments = p_comments, payment_id = v_pay
     WHERE id = e.id;
  ELSE
    v_new := CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'correction_requested' END;
    UPDATE public.credit_collection_entries
       SET status = v_new, verified_by = auth.uid(), verified_at = now(),
           verification_comments = p_comments, rejection_reason = p_reason
     WHERE id = e.id;
  END IF;

  INSERT INTO public.credit_collection_audit_logs (business_id, collection_entry_id,
    credit_transaction_id, action, actor_id, actor_email, previous_status, new_status,
    amount, payment_method, reference_number, comments, remarks)
  SELECT e.business_id, e.id, e.credit_transaction_id, p_action, auth.uid(), p.email,
    e.status, v_new, e.amount, e.payment_method::text, e.reference_number, p_comments, p_reason
  FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.audit_logs (business_id, user_id, module, action, record_id, new_value)
  VALUES (e.business_id, auth.uid(), 'Credit', 'Collection ' || p_action, e.reference_doc,
          jsonb_build_object('amount', e.amount, 'status', v_new));
END; $$;

-- ============ 10. Overdue sweep ============
CREATE OR REPLACE FUNCTION public.mark_overdue_credits()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.credit_transactions
     SET status = 'overdue'
   WHERE outstanding_amount > 0 AND due_date < CURRENT_DATE
     AND status IN ('active','partially_paid','pending');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- ============ 11. Execute grants ============
REVOKE EXECUTE ON FUNCTION public.create_credit_sale(uuid, jsonb, numeric, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.place_credit_order(uuid, jsonb, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_credit_collection(uuid, numeric, date, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resubmit_credit_collection(uuid, numeric, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_credit_collection(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_credit_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_credits() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_credit_sale(uuid, jsonb, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_credit_order(uuid, jsonb, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_credit_collection(uuid, numeric, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_credit_collection(uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_credit_collection(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_credits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_credit_officer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_verify_collections() TO authenticated;

-- ============ 12. Feature flag ============
INSERT INTO public.features (key, name, description, category, depends_on, enabled_globally)
VALUES ('customer_credit', 'Customer Credit (Udhar)',
        'Credit sales, due tracking, collection entries with verification and credit reports.',
        'Sales', NULL, true)
ON CONFLICT (key) DO NOTHING;