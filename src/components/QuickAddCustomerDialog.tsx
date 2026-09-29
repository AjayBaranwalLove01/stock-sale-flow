import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/queries";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export interface QuickAddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerCreated?: (customer: { id: string; name: string }) => void;
}

const empty = {
  name: "",
  mobile: "",
  email: "",
  gstin: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  opening_balance: "0",
  credit_limit: "0",
  credit_allowed: false,
  credit_terms_days: "15",
  status: "active" as "active" | "inactive",
};

export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  onCustomerCreated,
}: QuickAddCustomerDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Customer name is required");
      const payload = {
        name: form.name.trim(),
        mobile: form.mobile || null,
        email: form.email || null,
        gstin: form.gstin || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        opening_balance: Number(form.opening_balance || 0),
        credit_limit: Number(form.credit_limit || 0),
        credit_allowed: form.credit_allowed,
        credit_terms_days: Math.max(Number(form.credit_terms_days || 15), 1),
        status: form.status,
      };

      const { data: ins, error } = await supabase
        .from("customers")
        .insert({ ...payload, balance: payload.opening_balance })
        .select("id, name")
        .single();

      if (error) throw error;
      await logAudit("Customers", "Created", ins.id, null, payload);
      return ins;
    },
    onSuccess: (newCust) => {
      toast.success("Customer saved");
      void qc.invalidateQueries({ queryKey: ["customers"] });
      setForm(empty);
      onOpenChange(false);
      onCustomerCreated?.(newCust);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setForm(empty);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Customer name"
              autoFocus
            />
          </div>
          <div>
            <Label>Mobile</Label>
            <Input
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="Mobile number"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email address"
            />
          </div>
          <div>
            <Label>GSTIN</Label>
            <Input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              placeholder="GST number"
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="City"
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="State"
            />
          </div>
          <div>
            <Label>Pincode</Label>
            <Input
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
              placeholder="Pincode"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Street address"
            />
          </div>
          <div>
            <Label>Opening Balance</Label>
            <Input
              type="number"
              value={form.opening_balance}
              onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
            />
          </div>
          <div>
            <Label>Credit Limit</Label>
            <Input
              type="number"
              value={form.credit_limit}
              onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
            />
          </div>
          <div className="rounded-lg border p-3 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.credit_allowed}
                onCheckedChange={(v) => setForm({ ...form, credit_allowed: v })}
              />
              <Label>Allow credit purchase (Udhar)</Label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              When enabled, this customer can buy on credit up to the credit limit above.
            </p>
            {form.credit_allowed && (
              <div className="mt-3 max-w-[200px]">
                <Label>Credit terms (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.credit_terms_days}
                  onChange={(e) => setForm({ ...form, credit_terms_days: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              checked={form.status === "active"}
              onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "inactive" })}
            />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setForm(empty);
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
