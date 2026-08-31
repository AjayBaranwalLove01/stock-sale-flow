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
import { Separator } from "@/components/ui/separator";
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
import { Plus, Search, Trash2, ShoppingCart, Wallet } from "lucide-react";
import { usePurchases, useProducts, useSuppliers } from "@/lib/queries";
import { inr, dateFmt } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — Ledger ERP" },
      { name: "description", content: "Record supplier purchases, update stock and track payables." },
      { property: "og:title", content: "Purchases — Ledger ERP" },
      { property: "og:description", content: "Record supplier purchases, update stock and track payables." },
    ],
  }),
  component: PurchasesPage,
});

type Product = { id: string; name: string; sku: string; purchase_price: number; gst_rate: number };
type PLine = { product_id: string; name: string; quantity: number; rate: number; discount: number; gst_rate: number };

type PurchaseRow = {
  id: string;
  purchase_no: string;
  purchase_date: string;
  due_date: string | null;
  grand_total: number;
  paid_amount: number;
  tax_amount: number;
  suppliers: { name: string } | null;
  purchase_items: { id: string; quantity: number; rate: number; total: number; products: { name: string; sku: string } | null }[];
};

function PurchasesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = usePurchases();
  const rows = (data ?? []) as unknown as PurchaseRow[];
  const { data: suppliers } = useSuppliers();
  const { data: products } = useProducts();
  const plist = (products ?? []) as unknown as Product[];

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PurchaseRow | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paid, setPaid] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PLine[]>([]);
  const [pick, setPick] = useState("");

  const filtered = rows.filter((r) =>
    [r.purchase_no, r.suppliers?.name].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  const totals = useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
      const base = l.quantity * l.rate - l.discount;
      sub += base;
      tax += Math.round(((base * l.gst_rate) / 100) * 100) / 100;
    }
    return { sub, tax, grand: Math.round((sub + tax) * 100) / 100 };
  }, [lines]);

  function addProduct(id: string) {
    const p = plist.find((x) => x.id === id);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.product_id === id)
        ? prev
        : [
            ...prev,
            {
              product_id: p.id,
              name: p.name,
              quantity: 1,
              rate: Number(p.purchase_price || 0),
              discount: 0,
              gst_rate: Number(p.gst_rate || 0),
            },
          ],
    );
    setPick("");
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("Select a supplier");
      if (!lines.length) throw new Error("Add at least one item");
      const { error } = await supabase.rpc("create_purchase", {
        p_supplier_id: supplierId,
        p_purchase_date: purchaseDate,
        p_due_date: dueDate || (null as unknown as string),
        p_items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          rate: l.rate,
          discount: l.discount,
          gst_rate: l.gst_rate,
        })),
        p_paid_amount: Number(paid || 0),
        p_notes: notes || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase recorded");
      setOpen(false);
      setLines([]);
      setPaid("0");
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["purchases"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalPurchase = rows.reduce((s, r) => s + Number(r.grand_total || 0), 0);
  const totalDue = rows.reduce((s, r) => s + (Number(r.grand_total || 0) - Number(r.paid_amount || 0)), 0);

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Goods receipt entries that add stock to the inventory ledger."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 size-4" /> New Purchase
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Purchase Orders" value={rows.length} icon={ShoppingCart} />
        <StatCard label="Total Purchased" value={inr(totalPurchase)} icon={ShoppingCart} tone="info" />
        <StatCard label="Outstanding Payable" value={inr(totalDue)} icon={Wallet} tone="warning" />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search purchase or supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState title="No purchases yet" description="Record a purchase to add stock." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.purchase_no}</TableCell>
                    <TableCell className="text-sm">{dateFmt(r.purchase_date)}</TableCell>
                    <TableCell className="text-sm">{r.suppliers?.name ?? "—"}</TableCell>
                    <TableCell className="tabular text-right">{r.purchase_items?.length ?? 0}</TableCell>
                    <TableCell className="tabular text-right">{inr(r.grand_total)}</TableCell>
                    <TableCell className="text-right">
                      {Number(r.grand_total) - Number(r.paid_amount) > 0 ? (
                        <Badge variant="destructive">{inr(Number(r.grand_total) - Number(r.paid_amount))}</Badge>
                      ) : (
                        <Badge variant="secondary">Paid</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setView(r)}>
                        View
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Purchase</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {((suppliers ?? []) as { id: string; name: string }[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Add Product</Label>
            <Select value={pick} onValueChange={addProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Search and add a product" />
              </SelectTrigger>
              <SelectContent>
                {plist.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[280px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28">Rate</TableHead>
                  <TableHead className="w-24">Disc</TableHead>
                  <TableHead className="w-24">GST %</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No items added
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((l, i) => {
                    const base = l.quantity * l.rate - l.discount;
                    return (
                      <TableRow key={l.product_id}>
                        <TableCell className="text-sm">{l.name}</TableCell>
                        {(["quantity", "rate", "discount", "gst_rate"] as const).map((k) => (
                          <TableCell key={k}>
                            <Input
                              className="h-8"
                              type="number"
                              value={l[k]}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((x, idx) => (idx === i ? { ...x, [k]: Number(e.target.value) || 0 } : x)),
                                )
                              }
                            />
                          </TableCell>
                        ))}
                        <TableCell className="tabular text-right">{inr(base + (base * l.gst_rate) / 100)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex gap-3">
              <div>
                <Label>Paid Amount</Label>
                <Input type="number" className="w-36" value={paid} onChange={(e) => setPaid(e.target.value)} />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="w-52 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular">{inr(totals.sub)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular">{inr(totals.tax)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Grand Total</span>
                <span className="tabular">{inr(totals.grand)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Save Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{view?.purchase_no}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view?.purchase_items?.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.products?.name ?? "—"}</TableCell>
                  <TableCell className="tabular text-right">{it.quantity}</TableCell>
                  <TableCell className="tabular text-right">{inr(it.rate)}</TableCell>
                  <TableCell className="tabular text-right">{inr(it.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
