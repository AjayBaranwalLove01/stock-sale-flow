import { useState } from "react";
import { useCustomers } from "@/lib/queries";
import { useAddOldUdhar } from "@/lib/credit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/lib/format";

export interface AddOldUdharDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: string;
  onSuccess?: () => void;
}

export function AddOldUdharDialog({
  open,
  onOpenChange,
  defaultCustomerId,
  onSuccess,
}: AddOldUdharDialogProps) {
  const { data: customers } = useCustomers();
  const addOldUdhar = useAddOldUdhar();

  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [amount, setAmount] = useState("");
  const [creditDate, setCreditDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const selectedCustomer = (customers ?? []).find((c) => c.id === (customerId || defaultCustomerId));

  const resetForm = () => {
    setCustomerId(defaultCustomerId ?? "");
    setAmount("");
    setCreditDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setRemarks("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCustId = customerId || defaultCustomerId;
    if (!effectiveCustId) {
      toast.error("Please select a customer");
      return;
    }
    const val = Number(amount);
    if (!val || val <= 0) {
      toast.error("Please enter a valid outstanding Udhar amount");
      return;
    }
    if (!creditDate) {
      toast.error("Please specify the applicable Udhar date");
      return;
    }

    addOldUdhar.mutate(
      {
        customerId: effectiveCustId,
        amount: val,
        creditDate,
        dueDate: dueDate || creditDate,
        remarks: remarks.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Old Udhar of ${inr(val)} recorded for ${selectedCustomer?.name ?? "customer"}`);
          resetForm();
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Failed to record old Udhar balance");
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-5 text-amber-600" />
              Add Old / Opening Udhar
            </DialogTitle>
            <DialogDescription>
              Record an existing, pre-ERP outstanding credit balance for a customer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="old-udhar-customer" className="text-xs font-semibold">
                Customer *
              </Label>
              <Select
                value={customerId || defaultCustomerId || ""}
                onValueChange={setCustomerId}
              >
                <SelectTrigger id="old-udhar-customer">
                  <SelectValue placeholder="Select existing customer" />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.mobile ? `(${c.mobile})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomer && (
                <div className="text-xs text-muted-foreground flex items-center justify-between px-0.5 pt-0.5">
                  <span>Current Outstanding: <strong className="text-foreground">{inr(selectedCustomer.balance ?? 0)}</strong></span>
                  {selectedCustomer.credit_limit > 0 && (
                    <span>Credit Limit: <strong>{inr(selectedCustomer.credit_limit)}</strong></span>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="old-udhar-amount" className="text-xs font-semibold">
                  Outstanding Amount (₹) *
                </Label>
                <Input
                  id="old-udhar-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 5000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="old-udhar-date" className="text-xs font-semibold">
                  Old Udhar Date *
                </Label>
                <Input
                  id="old-udhar-date"
                  type="date"
                  value={creditDate}
                  onChange={(e) => setCreditDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="old-udhar-due-date" className="text-xs font-semibold">
                Due Date (Optional)
              </Label>
              <Input
                id="old-udhar-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="Leave blank to use Udhar date"
              />
              <p className="text-[11px] text-muted-foreground">
                If left empty, defaults to the applicable Udhar date.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="old-udhar-remarks" className="text-xs font-semibold">
                Remarks / Reference Note (Optional)
              </Label>
              <Textarea
                id="old-udhar-remarks"
                rows={2}
                placeholder="e.g. Previous manual register balance, bill #124"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
              <div className="leading-relaxed">
                This entry will appear in the customer's Udhar ledger, be included in their total outstanding balance, and allow payment collections to be recorded against it.
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={addOldUdhar.isPending || !(customerId || defaultCustomerId) || !amount}
            >
              {addOldUdhar.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Old Udhar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
