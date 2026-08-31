import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Search, Download, Truck, Wallet } from "lucide-react";
import { useSuppliers, logAudit } from "@/lib/queries";
import { inr, downloadCsv } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Ledger ERP" },
      { name: "description", content: "Manage supplier master, payment terms and payables." },
      { property: "og:title", content: "Suppliers — Ledger ERP" },
      { property: "og:description", content: "Manage supplier master, payment terms and payables." },
    ],
  }),
  component: SuppliersPage,
});

type Row = {
  id: string;
  name: string;
  company_name: string | null;
  mobile: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  opening_balance: number;
  balance: number;
  credit_limit: number;
  payment_terms: string | null;
  status: "active" | "inactive";
};

const empty = {
  id: "",
  name: "",
  company_name: "",
  mobile: "",
  email: "",
  gstin: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  opening_balance: "0",
  credit_limit: "0",
  payment_terms: "",
  status: "active" as "active" | "inactive",
};

function SuppliersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useSuppliers();
  const rows = (data ?? []) as unknown as Row[];
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        [r.name, r.company_name, r.mobile, r.gstin, r.city].some((v) =>
          (v ?? "").toLowerCase().includes(search.toLowerCase()),
        ),
      ),
    [rows, search],
  );

  const payable = rows.reduce((s, r) => s + Number(r.balance || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Supplier name is required");
      const payload = {
        name: form.name.trim(),
        company_name: form.company_name || null,
        mobile: form.mobile || null,
        email: form.email || null,
        gstin: form.gstin || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        opening_balance: Number(form.opening_balance || 0),
        credit_limit: Number(form.credit_limit || 0),
        payment_terms: form.payment_terms || null,
        status: form.status,
      };
      if (form.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", form.id);
        if (error) throw error;
        await logAudit("Suppliers", "Updated", form.id, null, payload);
      } else {
        const { data: ins, error } = await supabase
          .from("suppliers")
          .insert({ ...payload, balance: payload.opening_balance })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit("Suppliers", "Created", ins.id, null, payload);
      }
    },
    onSuccess: () => {
      toast.success("Supplier saved");
      setOpen(false);
      setForm(empty);
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(r: Row) {
    setForm({
      id: r.id,
      name: r.name,
      company_name: r.company_name ?? "",
      mobile: r.mobile ?? "",
      email: r.email ?? "",
      gstin: r.gstin ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      pincode: r.pincode ?? "",
      opening_balance: String(r.opening_balance ?? 0),
      credit_limit: String(r.credit_limit ?? 0),
      payment_terms: r.payment_terms ?? "",
      status: r.status,
    });
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Vendor master with GST details, payment terms and payable balances."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "suppliers.csv",
                  filtered.map((r) => ({
                    Name: r.name,
                    Company: r.company_name,
                    Mobile: r.mobile,
                    GSTIN: r.gstin,
                    City: r.city,
                    Payable: r.balance,
                    Terms: r.payment_terms,
                    Status: r.status,
                  })),
                )
              }
            >
              <Download className="mr-1.5 size-4" /> Export
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setForm(empty);
                setOpen(true);
              }}
            >
              <Plus className="mr-1.5 size-4" /> New Supplier
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Suppliers" value={rows.length} icon={Truck} />
        <StatCard
          label="Active"
          value={rows.filter((r) => r.status === "active").length}
          icon={Truck}
          tone="success"
        />
        <StatCard label="Total Payable" value={inr(payable)} icon={Wallet} tone="warning" />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search supplier, company, GSTIN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState title="No suppliers found" description="Add a supplier to record purchases." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">{r.company_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.mobile || "—"}</TableCell>
                    <TableCell className="text-sm">{r.gstin || "—"}</TableCell>
                    <TableCell className="text-sm">{r.payment_terms || "—"}</TableCell>
                    <TableCell className="tabular text-right font-medium">{inr(r.balance)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "active" ? "secondary" : "outline"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => edit(r)}>
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Supplier" : "New Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Company</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>GSTIN</Label>
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </div>
            <div>
              <Label>Payment Terms</Label>
              <Input
                placeholder="Net 30"
                value={form.payment_terms}
                onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
              />
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                checked={form.status === "active"}
                onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "inactive" })}
              />
              <Label>Active</Label>
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
