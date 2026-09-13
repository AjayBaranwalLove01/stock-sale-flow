import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, LoadingRows, EmptyState, StatCard } from "@/components/shared";
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
import { Search, Boxes, AlertTriangle, IndianRupee, SlidersHorizontal, Download } from "lucide-react";
import { useProducts, useInventoryTxns } from "@/lib/queries";
import { LocationSelector } from "@/components/LocationSelector";
import { useGodown, useMyWarehouses, useWarehouseStock } from "@/lib/warehouse";
import { inr, num, dateTimeFmt, downloadCsv } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Ledger ERP" },
      { name: "description", content: "Live stock levels and the full stock-in / stock-out transaction ledger." },
      { property: "og:title", content: "Inventory — Ledger ERP" },
      { property: "og:description", content: "Live stock levels and the full stock-in / stock-out transaction ledger." },
    ],
  }),
  component: InventoryPage,
});

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  reorder_level: number;
  purchase_price: number;
  rack: string | null;
  shelf: string | null;
  batch_number: string | null;
  expiry_date: string | null;
};

function InventoryPage() {
  const { data, isLoading } = useProducts();
  const products = (data ?? []) as unknown as Product[];
  const [q, setQ] = useState("");
  const [adjust, setAdjust] = useState<Product | null>(null);
  const { godown } = useGodown();
  const { warehouses } = useMyWarehouses();
  const [loc, setLoc] = useState<string | null>(null);
  const { data: wstock } = useWarehouseStock();

  const locStock = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of wstock ?? []) m.set(`${s.warehouse_id}:${s.product_id}`, Number(s.quantity));
    return m;
  }, [wstock]);
  const stockOf = (p: Product) =>
    godown && loc ? (locStock.get(`${loc}:${p.id}`) ?? 0) : Number(p.current_stock);

  const filtered = useMemo(
    () => products.filter((p) => [p.name, p.sku].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase()))),
    [products, q],
  );

  const totalValue = products.reduce((a, p) => a + stockOf(p) * Number(p.purchase_price), 0);
  const low = products.filter((p) => stockOf(p) <= Number(p.min_stock));
  const out = products.filter((p) => stockOf(p) <= 0);

  return (
    <div>
      <PageHeader title="Inventory" description="Stock is derived from the transaction ledger — the single source of truth." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Products" value={products.length} icon={Boxes} />
        <StatCard label="Stock Value" value={inr(totalValue)} icon={IndianRupee} tone="info" />
        <StatCard label="Low Stock" value={low.length} icon={AlertTriangle} tone="warning" />
        <StatCard label="Out of Stock" value={out.length} icon={AlertTriangle} tone="destructive" />
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="ledger">Stock Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <Card>
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search product or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <LocationSelector
                className="w-56"
                label=""
                includeAll
                value={loc}
                onChange={setLoc}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    "stock.csv",
                    filtered.map((p) => ({
                      SKU: p.sku,
                      Product: p.name,
                      Stock: stockOf(p),
                      Unit: p.unit,
                      Min: p.min_stock,
                      Value: Number(p.current_stock) * Number(p.purchase_price),
                    })),
                  )
                }
              >
                <Download className="mr-1.5 size-4" /> Export
              </Button>
            </div>
            {isLoading ? (
              <LoadingRows />
            ) : filtered.length === 0 ? (
              <EmptyState title="No products" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Batch / Expiry</TableHead>
                      {godown && !loc
                        ? warehouses.map((w) => (
                            <TableHead key={w.id} className="text-right">
                              {w.name}
                            </TableHead>
                          ))
                        : null}
                      <TableHead className="text-right">{godown && !loc ? "Total" : "Stock"}</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const stock = stockOf(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{p.sku}</TableCell>
                          <TableCell className="text-sm font-medium">{p.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {[p.rack, p.shelf].filter(Boolean).join(" / ") || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.batch_number || "—"}
                            {p.expiry_date ? ` · ${p.expiry_date}` : ""}
                          </TableCell>
                          {godown && !loc
                            ? warehouses.map((w) => (
                                <TableCell key={w.id} className="tabular text-right text-muted-foreground">
                                  {num(locStock.get(`${w.id}:${p.id}`) ?? 0)}
                                </TableCell>
                              ))
                            : null}
                          <TableCell className="text-right">
                            <Badge
                              variant={stock <= 0 ? "destructive" : stock <= Number(p.min_stock) ? "outline" : "secondary"}
                            >
                              {num(stock)} {p.unit}
                            </Badge>
                          </TableCell>
                          <TableCell className="tabular text-right">{inr(stock * Number(p.purchase_price))}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setAdjust(p)}>
                              <SlidersHorizontal className="mr-1.5 size-4" /> Adjust
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <Ledger />
        </TabsContent>
      </Tabs>

      <AdjustDialog product={adjust} onClose={() => setAdjust(null)} />
    </div>
  );
}

function AdjustDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Stock count correction");
  const [notes, setNotes] = useState("");

  const run = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const n = Number(qty);
      if (!n) throw new Error("Enter a non-zero adjustment quantity");
      const { error } = await supabase.rpc("adjust_stock", {
        p_product_id: product.id,
        p_qty: n,
        p_reason: reason,
        p_notes: notes || "",
        p_warehouse_id: warehouseId ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock adjusted");
      setQty("");
      setNotes("");
      onClose();
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
      void qc.invalidateQueries({ queryKey: ["warehouse_stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock · {product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Current stock: <span className="font-medium text-foreground">{num(product?.current_stock)} {product?.unit}</span>
          </p>
          <LocationSelector value={warehouseId} onChange={setWarehouseId} />
          <div>
            <Label>Adjustment Qty (use negative to reduce) *</Label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Stock count correction", "Damaged", "Expired", "Lost / theft", "Sample / free issue", "Other"].map(
                  (r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Txn = {
  id: string;
  txn_date: string;
  txn_type: string;
  reference_no: string | null;
  qty_in: number;
  qty_out: number;
  unit_cost: number;
  notes: string | null;
  warehouse_id: string | null;
  products: { name: string; sku: string; unit: string } | null;
};

function Ledger() {
  const { data, isLoading } = useInventoryTxns();
  const { godown } = useGodown();
  const { warehouses } = useMyWarehouses();
  const whName = new Map(warehouses.map((w) => [w.id, w.name] as const));
  const rows = (data ?? []) as unknown as Txn[];
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) =>
    [r.products?.name, r.products?.sku, r.reference_no, r.txn_type].some((v) =>
      (v ?? "").toLowerCase().includes(q.toLowerCase()),
    ),
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search ledger…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : filtered.length === 0 ? (
        <EmptyState title="No stock movements yet" />
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                {godown && <TableHead>Location</TableHead>}
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{dateTimeFmt(r.txn_date)}</TableCell>
                  <TableCell className="text-sm font-medium">{r.products?.name ?? "—"}</TableCell>
                  {godown && (
                    <TableCell className="text-sm text-muted-foreground">
                      {(r.warehouse_id && whName.get(r.warehouse_id)) || "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {r.txn_type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reference_no || "—"}</TableCell>
                  <TableCell className="tabular text-right text-success">
                    {Number(r.qty_in) ? num(r.qty_in) : "—"}
                  </TableCell>
                  <TableCell className="tabular text-right text-destructive">
                    {Number(r.qty_out) ? num(r.qty_out) : "—"}
                  </TableCell>
                  <TableCell className="tabular text-right">{inr(r.unit_cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
