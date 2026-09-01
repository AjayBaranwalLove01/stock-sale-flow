import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CreditStatus =
  | "pending"
  | "active"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type CollectionStatus =
  | "pending_verification"
  | "approved"
  | "rejected"
  | "correction_requested";

export type CreditTxn = {
  id: string;
  business_id: string;
  customer_id: string;
  sale_id: string | null;
  order_id: string | null;
  reference_no: string;
  credit_date: string;
  due_date: string;
  terms_days: number;
  original_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: CreditStatus;
  settled_at: string | null;
  settled_on_time: boolean | null;
  notes: string | null;
  created_at: string;
  customers: { name: string; mobile: string | null; credit_limit: number } | null;
};

export type CollectionEntry = {
  id: string;
  business_id: string;
  credit_transaction_id: string;
  customer_id: string;
  reference_doc: string | null;
  collection_officer_id: string | null;
  collection_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  remarks: string | null;
  status: CollectionStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_comments: string | null;
  rejection_reason: string | null;
  created_at: string;
  customers: { name: string; mobile: string | null } | null;
  credit_transactions: {
    reference_no: string;
    due_date: string;
    outstanding_amount: number;
  } | null;
};

export type CollectionAudit = {
  id: string;
  action: string;
  actor_email: string | null;
  previous_status: string | null;
  new_status: string | null;
  amount: number | null;
  payment_method: string | null;
  reference_number: string | null;
  remarks: string | null;
  comments: string | null;
  created_at: string;
};

export const CREDIT_STATUS_LABEL: Record<CreditStatus, string> = {
  pending: "Pending",
  active: "Active",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const COLLECTION_STATUS_LABEL: Record<CollectionStatus, string> = {
  pending_verification: "Pending verification",
  approved: "Approved",
  rejected: "Rejected",
  correction_requested: "Correction requested",
};

const DAY = 86_400_000;

/** Whole days a credit is past its due date (0 when not yet due). */
export function daysOverdue(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00`).getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.max(0, Math.round((today - due) / DAY));
}

export function daysUntilDue(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00`).getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.round((due - today) / DAY);
}

export function agingBucket(dueDate: string): "current" | "1-30" | "31-60" | "61-90" | "90+" {
  const d = daysOverdue(dueDate);
  if (d <= 0) return "current";
  if (d <= 30) return "1-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

/** Effective status — recomputed client-side so overdue shows without a nightly job. */
export function effectiveStatus(t: CreditTxn): CreditStatus {
  if (t.status === "cancelled") return "cancelled";
  if (Number(t.outstanding_amount) <= 0) return "paid";
  if (daysOverdue(t.due_date) > 0) return "overdue";
  return Number(t.paid_amount) > 0 ? "partially_paid" : "active";
}

export function useCreditTransactions() {
  return useQuery({
    queryKey: ["credit_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*, customers(name,mobile,credit_limit)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as unknown as CreditTxn[];
    },
  });
}

export function useCollectionEntries() {
  return useQuery({
    queryKey: ["credit_collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_collection_entries")
        .select(
          "*, customers(name,mobile), credit_transactions(reference_no,due_date,outstanding_amount)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CollectionEntry[];
    },
  });
}

export function useCollectionAudit(entryId: string | null) {
  return useQuery({
    queryKey: ["credit_collection_audit", entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_collection_audit_logs")
        .select("*")
        .eq("collection_entry_id", entryId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as CollectionAudit[];
    },
  });
}

function useCreditInvalidate() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["credit_transactions"] }),
      qc.invalidateQueries({ queryKey: ["credit_collections"] }),
      qc.invalidateQueries({ queryKey: ["customers"] }),
      qc.invalidateQueries({ queryKey: ["sales"] }),
      qc.invalidateQueries({ queryKey: ["customer_payments"] }),
    ]);
  };
}

export function useRecordCollection() {
  const invalidate = useCreditInvalidate();
  return useMutation({
    mutationFn: async (input: {
      creditTransactionId: string;
      amount: number;
      collectionDate: string;
      method: string;
      reference?: string;
      remarks?: string;
    }) => {
      const { error } = await supabase.rpc("record_credit_collection", {
        p_credit_transaction_id: input.creditTransactionId,
        p_amount: input.amount,
        p_collection_date: input.collectionDate,
        p_method: input.method,
        p_reference: input.reference || undefined,
        p_remarks: input.remarks || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useResubmitCollection() {
  const invalidate = useCreditInvalidate();
  return useMutation({
    mutationFn: async (input: {
      entryId: string;
      amount: number;
      method: string;
      reference?: string;
      remarks?: string;
    }) => {
      const { error } = await supabase.rpc("resubmit_credit_collection", {
        p_entry_id: input.entryId,
        p_amount: input.amount,
        p_method: input.method,
        p_reference: input.reference || undefined,
        p_remarks: input.remarks || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useVerifyCollection() {
  const invalidate = useCreditInvalidate();
  return useMutation({
    mutationFn: async (input: {
      entryId: string;
      action: "approve" | "reject" | "request_correction";
      comments?: string;
      reason?: string;
    }) => {
      const { error } = await supabase.rpc("verify_credit_collection", {
        p_entry_id: input.entryId,
        p_action: input.action,
        p_comments: input.comments || undefined,
        p_reason: input.reason || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** True when the signed-in user may approve or reject collection entries. */
export function useCanVerifyCollections() {
  return useQuery({
    queryKey: ["can-verify-collections"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_verify_collections");
      if (error) return false;
      return Boolean(data);
    },
    staleTime: 60_000,
  });
}
