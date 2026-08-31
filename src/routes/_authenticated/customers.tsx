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
import { Plus, Pencil, Search, Download, Users, Wallet } from "lucide-react";
import { useCustomers, logAudit } from "@/lib/queries";
import { inr, downloadCsv } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Ledger ERP" },
      { name: "description", content: "Manage customer master, credit limits and outstanding balances." },
      { property: "og:title", content: "Customers — Ledger ERP" },
      { property: "og:description", content: "Manage customer master, credit limits and outstanding balances." },
    ],
  }),
  component: CustomersPage,
});

type Row = {
  id: string;
  name: string;
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
  status: "active" | "inactive";
};

const empty = {
  id: "",
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
  status: "active" as "active" | "inactive",
};

function CustomersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useCustomers();
  const rows = (data ?? []) as unknown as Row[];
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        [r.name, r.mobile, r.email, r.gstin, r.city].some((v) =>
          (v ?? "").toLowerCase().includes(search.toLowerCase()),
        ),
      ),
    [rows, search],
  );

  const outstanding = rows.reduce((s, r) => s + Number(r.balance || 0), 0);

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
        status: form.status,
      };
      if (form.id) {
        const { error } = await supabase.from("customers").update(payload).eq("id", form.id);
        if (error) throw error;
        await logAudit("Customers", "Updated", form.id, null, payload);
      } else {
        const { data: ins, error } = await supabase
          .from("customers")
          .insert({ ...payload, balance: payload.opening_balance })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit("Customers", "Created", ins.id, null, payload);
      }
    },
    onSuccess: () => {
      toast.success("Customer saved");
      setOpen(false);
      setForm(empty);
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(r: Row) {
    setForm({
      id: r.id,
      name: r.name,
      mobile: r.mobile ?? "",
      email: r.email ?? "",
      gstin: r.gstin ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      pincode: r.pincode ?? "",
      opening_balance: String(r.opening_balance ?? 0),
      credit_limit: String(r.credit_limit ?? 0),
      status: r.status,
    });
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer master with GST details, credit limits and running balances."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "customers.csv",
                  filtered.map((r) => ({
                    Name: r.name,
                    Mobile: r.mobile,
                    Email: r.email,
                    GSTIN: r.gstin,
                    City: r.city,
                    State: r.state,
                    Balance: r.balance,
                    CreditLimit: r.credit_limit,
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
              <Plus className="mr-1.5 size-4" /> New Customer
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Customers" value={rows.length} icon={Users} />
        <StatCard
          label="Active"
          value={rows.filter((r) => r.status === "active").length}
          icon={Users}
          tone="success"
        />
        <StatCard label="Total Outstanding" value={inr(outstanding)} icon={Wallet} tone="warning" />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name, mobile, GSTIN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState title="No customers found" description="Add your first customer to start billing." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.mobile || "—"}
                      {r.email ? <div className="text-xs">{r.email}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{r.gstin || "—"}</TableCell>
                    <TableCell className="text-sm">{r.city || "—"}</TableCell>
                    <TableCell className="tabular text-right">{inr(r.credit_limit)}</TableCell>
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
            <DialogTitle>{form.id ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div>
              <Label>Pincode</Label>
              <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
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
