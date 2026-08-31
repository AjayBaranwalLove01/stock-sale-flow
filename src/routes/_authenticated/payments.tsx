import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Wallet, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useCustomers, useSuppliers, logAudit } from "@/lib/queries";
import { inr, dateTimeFmt, PAYMENT_METHODS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Ledger ERP" },
      { name: "description", content: "Record customer receipts and supplier payments against balances." },
      { property: "og:title", content: "Payments — Ledger ERP" },
      { property: "og:description", content: "Record customer receipts and supplier payments against balances." },
    ],
  }),
  component: PaymentsPage,
});

type Payment = {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference_no: string | null;
  remarks: string | null;
  customers?: { name: string } | null;
  suppliers?: { name: string } | null;
};

function usePayments(kind: "customer" | "supplier") {
  return useQuery({
    queryKey: ["payments", kind],
    queryFn: async () => {
      const table = kind === "customer" ? "customer_payments" : "supplier_payments";
      const rel = kind === "customer" ? "customers(name)" : "suppliers(name)";
      const { data, error } = await supabase
        .from(table)
        .select(`*, ${rel}`)
        .order("payment_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Payment[];
    },
  });
}

function PaymentsPage() {
  return (
    <div>
      <PageHeader title="Payments" description="Money in from customers and money out to suppliers." />
      <Tabs defaultValue="in">
        <TabsList>
          <TabsTrigger value="in">Customer Receipts</TabsTrigger>
          <TabsTrigger value="out">Supplier Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="in" className="mt-4">
          <PaymentPanel kind="customer" />
        </TabsContent>
        <TabsContent value="out" className="mt-4">
          <PaymentPanel kind="supplier" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentPanel({ kind }: { kind: "customer" | "supplier" }) {
  const qc = useQueryClient();
  const { data, isLoading } = usePayments(kind);
  const rows = data ?? [];
  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const parties = ((kind === "customer" ? customers : suppliers) ?? []) as unknown as {
    id: string;
    name: string;
    balance: number;
  }[];

  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [remarks, setRemarks] = useState("");

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const outstanding = parties.reduce((s, p) => s + Number(p.balance || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error("Select a party");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      if (kind === "customer") {
        const { error } = await supabase.from("customer_payments").insert({
          customer_id: partyId,
          amount: amt,
          method: method as "cash",
          reference_no: ref || null,
          remarks: remarks || null,
        });
        if (error) throw error;
        const current = parties.find((p) => p.id === partyId)?.balance ?? 0;
        const { error: uerr } = await supabase
          .from("customers")
          .update({ balance: Number(current) - amt })
          .eq("id", partyId);
        if (uerr) throw uerr;
      } else {
        const { error } = await supabase.from("supplier_payments").insert({
          supplier_id: partyId,
          amount: amt,
          method: method as "cash",
          reference_no: ref || null,
          remarks: remarks || null,
        });
        if (error) throw error;
        const current = parties.find((p) => p.id === partyId)?.balance ?? 0;
        const { error: uerr } = await supabase
          .from("suppliers")
          .update({ balance: Number(current) - amt })
          .eq("id", partyId);
        if (uerr) throw uerr;
      }
      await logAudit("Payments", kind === "customer" ? "Receipt Recorded" : "Payment Recorded", partyId, null, {
        amount: amt,
        method,
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setOpen(false);
      setPartyId("");
      setAmount("");
      setRef("");
      setRemarks("");
      void qc.invalidateQueries({ queryKey: ["payments", kind] });
      void qc.invalidateQueries({ queryKey: [kind === "customer" ? "customers" : "suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={kind === "customer" ? "Total Received" : "Total Paid"}
          value={inr(total)}
          icon={kind === "customer" ? ArrowDownLeft : ArrowUpRight}
          tone={kind === "customer" ? "success" : "info"}
        />
        <StatCard label="Transactions" value={rows.length} icon={Wallet} />
        <StatCard
          label={kind === "customer" ? "Receivable" : "Payable"}
          value={inr(outstanding)}
          icon={Wallet}
          tone="warning"
        />
      </div>

      <Card>
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">
            {kind === "customer" ? "Customer receipts" : "Supplier payments"}
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 size-4" /> Record Payment
          </Button>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState title="No payments recorded" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>{kind === "customer" ? "Customer" : "Supplier"}</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{dateTimeFmt(r.payment_date)}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {r.customers?.name ?? r.suppliers?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {r.method.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reference_no || "—"}</TableCell>
                    <TableCell className="tabular text-right font-medium">{inr(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record {kind === "customer" ? "Receipt" : "Payment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{kind === "customer" ? "Customer" : "Supplier"} *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {inr(p.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference No</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} />
            </div>
            <div>
              <Label>Remarks</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
