import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { inr, dateTimeFmt } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Trash2,
  PackageCheck,
  CreditCard,
  History,
  ShieldAlert,
} from "lucide-react";

export interface DeleteInvoiceTarget {
  id: string;
  invoice_no: string;
  invoice_date?: string | null | undefined;
  customer_name?: string | null | undefined;
  customer_id?: string | null | undefined;
  grand_total: number;
  paid_amount?: number | null | undefined;
  business_id?: string | null | undefined;
}

interface DeleteInvoiceDialogProps {
  sale: DeleteInvoiceTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteInvoiceDialog({
  sale,
  open,
  onOpenChange,
  onSuccess,
}: DeleteInvoiceDialogProps) {
  const qc = useQueryClient();
  const { user, roles, isSuperAdmin } = useAuth();
  const isAdmin = isSuperAdmin || roles.includes("admin");

  const [reason, setReason] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!isAdmin) {
        throw new Error("Unauthorized: Only administrators can delete invoices.");
      }
      if (!sale) throw new Error("No invoice selected for deletion.");

      // 1. Try atomic PostgreSQL RPC first
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("delete_sale_invoice", {
        p_sale_id: sale.id,
        p_reason: reason.trim() || "Deleted by Admin",
      });

      if (!rpcError) {
        return rpcData;
      }

      // If function is missing (e.g. migration sync delay), use client-side transaction orchestration fallback
      if (rpcError.message?.includes("function") && rpcError.message?.includes("does not exist")) {
        console.warn("delete_sale_invoice RPC not found, executing client fallback orchestration");
        return await clientSideDeleteFallback(sale, reason, user);
      }

      throw rpcError;
    },
    onSuccess: async () => {
      toast.success(`Invoice ${sale?.invoice_no} deleted successfully`, {
        description: "Stock quantities restored and customer balance adjusted.",
      });

      // Invalidate all related caches to ensure real-time update across all tabs and reports
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sales"] }),
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["warehouse-stock"] }),
        qc.invalidateQueries({ queryKey: ["inventory_txns"] }),
        qc.invalidateQueries({ queryKey: ["customers"] }),
        qc.invalidateQueries({ queryKey: ["credit_transactions"] }),
        qc.invalidateQueries({ queryKey: ["credit_entries"] }),
        qc.invalidateQueries({ queryKey: ["reports"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["audit_logs"] }),
      ]);

      setReason("");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: any) => {
      toast.error("Failed to delete invoice", {
        description: err.message || "An unexpected error occurred.",
      });
    },
  });

  if (!isAdmin) {
    return null;
  }

  const grandTotal = Number(sale?.grand_total) || 0;
  const paidAmount = Number(sale?.paid_amount) || 0;
  const dueAmount = Math.max(0, grandTotal - paidAmount);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !deleteMutation.isPending && onOpenChange(o)}>
      <AlertDialogContent className="max-w-md sm:max-w-lg">
        <AlertDialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="size-5 text-destructive" />
            </div>
            <div>
              <AlertDialogTitle className="text-lg">Delete Invoice</AlertDialogTitle>
              <div className="text-xs text-muted-foreground">Admin-only operation</div>
            </div>
          </div>
          <AlertDialogDescription className="text-sm font-medium text-foreground">
            Are you sure you want to delete this invoice? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {sale && (
          <div className="space-y-3.5 py-1">
            {/* Invoice summary preview box */}
            <div className="rounded-lg border bg-muted/40 p-3.5 space-y-2 text-sm">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground text-xs">Invoice Number</span>
                <span className="font-mono font-semibold text-primary">{sale.invoice_no}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Customer</span>
                <span className="font-medium">{sale.customer_name || "Walk-in Customer"}</span>
              </div>
              {sale.invoice_date && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Invoice Date</span>
                  <span>{dateTimeFmt(sale.invoice_date)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground text-xs">Grand Total</span>
                <span className="font-semibold tabular">{inr(grandTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Payment Status</span>
                <span>
                  {dueAmount > 0 ? (
                    <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5 text-[11px]">
                      {inr(paidAmount)} Paid • {inr(dueAmount)} Due
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[11px]">
                      Fully Paid ({inr(paidAmount)})
                    </Badge>
                  )}
                </span>
              </div>
            </div>

            {/* Impact breakdown */}
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs space-y-1.5 text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                <ShieldAlert className="size-3.5" />
                Automatic Deletion Handling:
              </div>
              <div className="flex items-start gap-2">
                <PackageCheck className="size-3.5 shrink-0 text-emerald-600 mt-0.5" />
                <span>Restores all sold product quantities back to inventory and warehouse stock.</span>
              </div>
              {dueAmount > 0 && sale.customer_id && (
                <div className="flex items-start gap-2">
                  <CreditCard className="size-3.5 shrink-0 text-blue-600 mt-0.5" />
                  <span>Deducts {inr(dueAmount)} from customer's outstanding Udhar balance.</span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <History className="size-3.5 shrink-0 text-purple-600 mt-0.5" />
                <span>Permanently logs this deletion with your admin identity in the system audit trail.</span>
              </div>
            </div>

            {/* Reason input */}
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason" className="text-xs">
                Reason for deletion <span className="text-muted-foreground font-normal">(optional, for audit trail)</span>
              </Label>
              <Input
                id="delete-reason"
                placeholder="e.g. Order cancelled, duplicate bill, test sale..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={deleteMutation.isPending}
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={deleteMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            className="gap-1.5"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Delete Invoice
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Client-side deletion fallback orchestrator if RPC is temporarily not available
 */
async function clientSideDeleteFallback(
  sale: DeleteInvoiceTarget,
  reason: string,
  user: any,
) {
  // Check if returns exist
  const { data: returns } = await supabase
    .from("sales_returns")
    .select("id, return_no")
    .eq("sale_id", sale.id);

  if (returns && returns.length > 0) {
    throw new Error(
      `Cannot delete invoice ${sale.invoice_no} because it has associated sales returns (${returns.map((r) => r.return_no).join(", ")}).`,
    );
  }

  // Check if credit transaction exists
  const { data: creditTxn } = await supabase
    .from("credit_transactions")
    .select("id, paid_amount, outstanding_amount")
    .eq("sale_id", sale.id)
    .maybeSingle();

  if (creditTxn) {
    // Delete credit collection audit logs & entries
    await supabase.from("credit_collection_audit_logs").delete().eq("credit_transaction_id", creditTxn.id);
    await supabase.from("credit_collection_entries").delete().eq("credit_transaction_id", creditTxn.id);
    await supabase.from("credit_transactions").delete().eq("id", creditTxn.id);
  }

  // Adjust customer balance
  const due = Math.max(0, (Number(sale.grand_total) || 0) - (Number(sale.paid_amount) || 0));
  if (sale.customer_id && due > 0) {
    const { data: cust } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", sale.customer_id)
      .single();

    if (cust) {
      await supabase
        .from("customers")
        .update({ balance: Math.max(0, (Number(cust.balance) || 0) - due) })
        .eq("id", sale.customer_id);
    }
  }

  // Delete customer payments
  await supabase.from("customer_payments").delete().eq("sale_id", sale.id);

  // Fetch sale items to know products
  const { data: saleItems } = await supabase
    .from("sale_items")
    .select("product_id, quantity")
    .eq("sale_id", sale.id);

  // Delete inventory movements (triggers sync_product_stock on DELETE)
  await supabase
    .from("inventory_transactions")
    .delete()
    .eq("reference_id", sale.id)
    .in("reference_type", ["sale"]);

  // Delete sale items
  await supabase.from("sale_items").delete().eq("sale_id", sale.id);

  // Delete invoice send history
  await (supabase.from as any)("invoice_send_history").delete().eq("sale_id", sale.id);

  // Log in audit log
  await supabase.from("audit_logs").insert({
    business_id: sale.business_id ?? null,
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    module: "Sales",
    action: "Invoice Deleted by Admin",
    record_id: sale.invoice_no,
    old_value: {
      invoice_id: sale.id,
      invoice_no: sale.invoice_no,
      customer_name: sale.customer_name,
      grand_total: sale.grand_total,
      paid_amount: sale.paid_amount,
    },
    new_value: {
      reason: reason || "Deleted by Admin",
      deleted_by_user_id: user?.id,
      deleted_at: new Date().toISOString(),
    },
  });

  // Finally delete the sale
  const { error: saleDelErr } = await supabase.from("sales").delete().eq("id", sale.id);
  if (saleDelErr) throw saleDelErr;

  return { success: true, invoice_no: sale.invoice_no };
}
