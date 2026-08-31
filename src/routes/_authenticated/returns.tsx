import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Undo2 } from "lucide-react";
import { useSales, usePurchases } from "@/lib/queries";
import { inr, dateTimeFmt } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({
    meta: [
      { title: "Returns — Ledger ERP" },
      { name: "description", content: "Process sales returns and purchase returns with automatic stock updates." },
      { property: "og:title", content: "Returns — Ledger ERP" },
      { property: "og:description", content: "Process sales returns and purchase returns with automatic stock updates." },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  return (
    <div>
      <PageHeader title="Returns" description="Sales and purchase returns post reversal entries to the stock ledger." />
      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales Returns</TabsTrigger>
          <TabsTrigger value="purchase">Purchase Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          <SalesReturns />
        </TabsContent>
        <TabsContent value="purchase" className="mt-4">
          <PurchaseReturns />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ReturnRow = {
  id: string;
  return_no: string;
  return_date: string;
  total_amount: number;
  reason: string | null;
};

type SaleItem = { id: string; product_name: string; quantity: number; returned_qty: number; rate: number };
type SaleRow = { id: string; invoice_no: string; customer_name: string; sale_items: SaleItem[] };

function SalesReturns() {
  const qc = useQueryClient();
  const { data: sales } = useSales();
  const saleRows = (sales ?? []) as unknown as SaleRow[];
  const { data, isLoading } = useQuery({
    queryKey: ["sales_returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select("*, sales(invoice_no), customers(name)")
        .order("return_date", { ascending: false });
      if (error) throw error;
      return data as unknown as (ReturnRow & { sales: { invoice_no: string } | null; customers: { name: string } | null })[];
    },
  });
  const rows = data ?? [];

  const [open, setOpen] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});

  const sale = saleRows.find((s) => s.id === saleId);

  const create = useMutation({
    mutationFn: async () => {
      const items = Object.entries(qty)
        .filter(([, v]) => Number(v) > 0)
        .map(([sale_item_id, v]) => ({ sale_item_id, quantity: Number(v) }));
      if (!saleId) throw new Error("Select an invoice");
      if (!items.length) throw new Error("Enter return quantities");
      const { error } = await supabase.rpc("create_sales_return", {
        p_sale_id: saleId,
        p_items: items,
        p_reason: reason || "Customer return",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sales return created");
      setOpen(false);
      setSaleId("");
      setQty({});
      setReason("");
      void qc.invalidateQueries({ queryKey: ["sales_returns"] });
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  return (
    <div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <StatCard label="Sales Returns" value={rows.length} icon={Undo2} />
        <StatCard label="Return Value" value={inr(total)} icon={Undo2} tone="destructive" />
      </div>
      <Card>
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">Sales returns</p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 size-4" /> New Return
          </Button>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState title="No sales returns" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.return_no}</TableCell>
                  <TableCell className="text-sm">{dateTimeFmt(r.return_date)}</TableCell>
                  <TableCell className="text-sm">{r.sales?.invoice_no ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.customers?.name ?? "Walk-in"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason || "—"}</TableCell>
                  <TableCell className="tabular text-right">{inr(r.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Sales Return</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Invoice *</Label>
            <Select value={saleId} onValueChange={(v) => { setSaleId(v); setQty({}); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select invoice" />
              </SelectTrigger>
              <SelectContent>
                {saleRows.slice(0, 100).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.invoice_no} · {s.customer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sale && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="w-28">Return Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.sale_items?.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{it.product_name}</TableCell>
                      <TableCell className="tabular text-right">{it.quantity}</TableCell>
                      <TableCell className="tabular text-right">{it.returned_qty}</TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          type="number"
                          value={qty[it.id] ?? ""}
                          onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged / wrong item" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Save Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type PurchaseItem = { id: string; quantity: number; returned_qty: number; rate: number; products: { name: string } | null };
type PurchaseRow = { id: string; purchase_no: string; suppliers: { name: string } | null; purchase_items: PurchaseItem[] };

function PurchaseReturns() {
  const qc = useQueryClient();
  const { data: purchases } = usePurchases();
  const pRows = (purchases ?? []) as unknown as PurchaseRow[];
  const { data, isLoading } = useQuery({
    queryKey: ["purchase_returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("*, purchases(purchase_no), suppliers(name)")
        .order("return_date", { ascending: false });
      if (error) throw error;
      return data as unknown as (ReturnRow & {
        purchases: { purchase_no: string } | null;
        suppliers: { name: string } | null;
      })[];
    },
  });
  const rows = data ?? [];

  const [open, setOpen] = useState(false);
  const [purchaseId, setPurchaseId] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const purchase = pRows.find((p) => p.id === purchaseId);

  const create = useMutation({
    mutationFn: async () => {
      const items = Object.entries(qty)
        .filter(([, v]) => Number(v) > 0)
        .map(([purchase_item_id, v]) => ({ purchase_item_id, quantity: Number(v) }));
      if (!purchaseId) throw new Error("Select a purchase");
      if (!items.length) throw new Error("Enter return quantities");
      const { error } = await supabase.rpc("create_purchase_return", {
        p_purchase_id: purchaseId,
        p_items: items,
        p_reason: reason || "Returned to supplier",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase return created");
      setOpen(false);
      setPurchaseId("");
      setQty({});
      setReason("");
      void qc.invalidateQueries({ queryKey: ["purchase_returns"] });
      void qc.invalidateQueries({ queryKey: ["purchases"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  return (
    <div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <StatCard label="Purchase Returns" value={rows.length} icon={Undo2} />
        <StatCard label="Return Value" value={inr(total)} icon={Undo2} tone="warning" />
      </div>
      <Card>
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">Purchase returns</p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 size-4" /> New Return
          </Button>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState title="No purchase returns" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Purchase</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.return_no}</TableCell>
                  <TableCell className="text-sm">{dateTimeFmt(r.return_date)}</TableCell>
                  <TableCell className="text-sm">{r.purchases?.purchase_no ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.suppliers?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason || "—"}</TableCell>
                  <TableCell className="tabular text-right">{inr(r.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Purchase Return</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Purchase *</Label>
            <Select value={purchaseId} onValueChange={(v) => { setPurchaseId(v); setQty({}); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select purchase" />
              </SelectTrigger>
              <SelectContent>
                {pRows.slice(0, 100).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.purchase_no} · {p.suppliers?.name ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {purchase && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="w-28">Return Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchase.purchase_items?.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{it.products?.name ?? "—"}</TableCell>
                      <TableCell className="tabular text-right">{it.quantity}</TableCell>
                      <TableCell className="tabular text-right">{it.returned_qty}</TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          type="number"
                          value={qty[it.id] ?? ""}
                          onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Save Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
