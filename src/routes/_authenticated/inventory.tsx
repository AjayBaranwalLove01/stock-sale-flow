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
import { Search, Boxes, AlertTriangle, IndianRupee, SlidersHorizontal, Download, CalendarClock, ShieldAlert, Layers } from "lucide-react";
import { useProducts, useInventoryTxns } from "@/lib/queries";
import { LocationSelector } from "@/components/LocationSelector";
import { useGodown, useMyWarehouses, useWarehouseStock } from "@/lib/warehouse";
import { inr, num, dateTimeFmt, downloadCsv } from "@/lib/format";
import { OpeningStockDialog, type OpeningStockProduct } from "@/components/OpeningStockDialog";
import { useActiveBusiness } from "@/hooks/useTenant";
import { isMedicalBusiness } from "@/lib/businessTypes";
import { useAllBatches, useAdjustBatchStock, getExpiryCategory, getDaysUntilExpiry, type ProductBatch } from "@/lib/batches";

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
  active_formulation?: string | null;
  has_batches?: boolean;
};

function InventoryPage() {
  const { data, isLoading } = useProducts();
  const products = (data ?? []) as unknown as Product[];
  const [q, setQ] = useState("");
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [adjustBatch, setAdjustBatch] = useState<ProductBatch | null>(null);
  const [openingProduct, setOpeningProduct] = useState<OpeningStockProduct | null>(null);
  const { godown } = useGodown();
  const { warehouses } = useMyWarehouses();
  const [loc, setLoc] = useState<string | null>(null);
  const { data: wstock } = useWarehouseStock();

  const { data: activeBusiness } = useActiveBusiness();
  const isMedical = isMedicalBusiness(activeBusiness?.business_type);
  const { data: batchData } = useAllBatches();
  const batches = (batchData ?? []) as ProductBatch[];

  const [batchFilter, setBatchFilter] = useState<"all" | "expired" | "d30" | "d60" | "d90">("all");
  const [batchQ, setBatchQ] = useState("");

  const locStock = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of wstock ?? []) m.set(`${s.warehouse_id}:${s.product_id}`, Number(s.quantity));
    return m;
  }, [wstock]);
  const stockOf = (p: Product) =>
    godown && loc ? (locStock.get(`${loc}:${p.id}`) ?? 0) : Number(p.current_stock);

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        [p.name, p.sku, p.active_formulation, p.batch_number].some((v) =>
          (v ?? "").toLowerCase().includes(q.toLowerCase()),
        ),
      ),
    [products, q],
  );

  const totalValue = products.reduce((a, p) => a + stockOf(p) * Number(p.purchase_price), 0);
  const low = products.filter((p) => stockOf(p) <= Number(p.min_stock));
  const out = products.filter((p) => stockOf(p) <= 0);

  // Batch analytics
  const expiredBatches = useMemo(
    () => batches.filter((b) => getExpiryCategory(b.expiry_date) === "expired"),
    [batches],
  );
  const expiring30Batches = useMemo(
    () => batches.filter((b) => getExpiryCategory(b.expiry_date) === "d30"),
    [batches],
  );
  const expiring60Batches = useMemo(
    () => batches.filter((b) => ["d30", "d60"].includes(getExpiryCategory(b.expiry_date))),
    [batches],
  );
  const expiring90Batches = useMemo(
    () => batches.filter((b) => ["d30", "d60", "d90"].includes(getExpiryCategory(b.expiry_date))),
    [batches],
  );
  const totalBatchStock = useMemo(
    () => batches.reduce((acc, b) => acc + Number(b.quantity || 0), 0),
    [batches],
  );

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      // Expiry filter
      if (batchFilter === "expired" && getExpiryCategory(b.expiry_date) !== "expired") return false;
      if (batchFilter === "d30" && getExpiryCategory(b.expiry_date) !== "d30") return false;
      if (
        batchFilter === "d60" &&
        !["d30", "d60"].includes(getExpiryCategory(b.expiry_date))
      )
        return false;
      if (
        batchFilter === "d90" &&
        !["d30", "d60", "d90"].includes(getExpiryCategory(b.expiry_date))
      )
        return false;

      // Text search
      if (!batchQ.trim()) return true;
      const term = batchQ.toLowerCase();
      return (
        b.batch_number.toLowerCase().includes(term) ||
        (b.products?.name ?? "").toLowerCase().includes(term) ||
        (b.products?.sku ?? "").toLowerCase().includes(term) ||
        (b.products?.active_formulation ?? "").toLowerCase().includes(term)
      );
    });
  }, [batches, batchFilter, batchQ]);

  const showBatchSection = isMedical || batches.length > 0;

  return (
    <div>
      <PageHeader
        title={isMedical ? "Pharmacy & Medical Inventory" : "Inventory"}
        description="Stock is derived from the transaction ledger — the single source of truth."
      />

      {/* Main Stock Stats */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Products" value={products.length} icon={Boxes} />
        <StatCard label="Stock Value" value={inr(totalValue)} icon={IndianRupee} tone="info" />
        <StatCard label="Low Stock" value={low.length} icon={AlertTriangle} tone="warning" />
        <StatCard label="Out of Stock" value={out.length} icon={AlertTriangle} tone="destructive" />
      </div>

      {/* Medical Expiry Management Dashboard Cards */}
      {showBatchSection && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Expired Batches"
            value={expiredBatches.length}
            hint={`${num(expiredBatches.reduce((a, b) => a + Number(b.quantity || 0), 0))} units expired`}
            icon={ShieldAlert}
            tone="destructive"
          />
          <StatCard
            label="Expiring ≤ 30 Days"
            value={expiring30Batches.length}
            hint={`${num(expiring30Batches.reduce((a, b) => a + Number(b.quantity || 0), 0))} units near expiry`}
            icon={CalendarClock}
            tone="warning"
          />
          <StatCard
            label="Total Batch Stock"
            value={num(totalBatchStock)}
            hint="Across all active batches"
            icon={Boxes}
            tone="info"
          />
          <StatCard
            label="Total Batches"
            value={batches.length}
            hint={`${batches.filter((b) => b.status === "active").length} active batches`}
            icon={Layers}
          />
        </div>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          {showBatchSection && (
            <TabsTrigger value="batches" className="relative">
              Batches & Expiry
              {expiredBatches.length > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.2 text-[10px] text-destructive-foreground">
                  {expiredBatches.length}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="ledger">Stock Ledger</TabsTrigger>
        </TabsList>

        {/* Tab 1: Product Stock Levels */}
        <TabsContent value="stock" className="mt-4">
          <Card>
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={
                    isMedical
                      ? "Search product, SKU, active formulation…"
                      : "Search product or SKU…"
                  }
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
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
                      ActiveFormulation: p.active_formulation || "",
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
                      {isMedical && <TableHead>Active Formulation</TableHead>}
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
                          <TableCell className="text-sm font-medium">
                            {p.name}
                            {p.has_batches && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                Batched
                              </Badge>
                            )}
                          </TableCell>
                          {isMedical && (
                            <TableCell className="text-sm text-muted-foreground">
                              {p.active_formulation ? (
                                <Badge variant="secondary" className="font-normal">
                                  {p.active_formulation}
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          )}
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
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Opening Stock"
                                onClick={() =>
                                  setOpeningProduct({
                                    id: p.id,
                                    name: p.name,
                                    sku: p.sku,
                                    unit: p.unit,
                                    purchase_price: Number(p.purchase_price || 0),
                                    current_stock: Number(p.current_stock || 0),
                                  })
                                }
                              >
                                <Boxes className="mr-1.5 size-4 text-primary" /> Opening Stock
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setAdjust(p)}>
                                <SlidersHorizontal className="mr-1.5 size-4" /> Adjust
                              </Button>
                            </div>
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

        {/* Tab 2: Batches & Expiry Management */}
        {showBatchSection && (
          <TabsContent value="batches" className="mt-4">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-72">
                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search batch, product, formulation…"
                      value={batchQ}
                      onChange={(e) => setBatchQ(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1 rounded-md border p-1 bg-muted/20">
                    <Button
                      variant={batchFilter === "all" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setBatchFilter("all")}
                    >
                      All ({batches.length})
                    </Button>
                    <Button
                      variant={batchFilter === "expired" ? "destructive" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setBatchFilter("expired")}
                    >
                      Expired ({expiredBatches.length})
                    </Button>
                    <Button
                      variant={batchFilter === "d30" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setBatchFilter("d30")}
                    >
                      ≤ 30 Days ({expiring30Batches.length})
                    </Button>
                    <Button
                      variant={batchFilter === "d60" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setBatchFilter("d60")}
                    >
                      ≤ 60 Days ({expiring60Batches.length})
                    </Button>
                    <Button
                      variant={batchFilter === "d90" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setBatchFilter("d90")}
                    >
                      ≤ 90 Days ({expiring90Batches.length})
                    </Button>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      "batch-expiry-report.csv",
                      filteredBatches.map((b) => ({
                        BatchNumber: b.batch_number,
                        Product: b.products?.name ?? "",
                        SKU: b.products?.sku ?? "",
                        ActiveFormulation: b.products?.active_formulation ?? "",
                        ExpiryDate: b.expiry_date ?? "",
                        DaysToExpiry: getDaysUntilExpiry(b.expiry_date) ?? "",
                        Status: b.status,
                        Quantity: b.quantity,
                        MRP: b.mrp,
                        SellingPrice: b.selling_price,
                        PurchasePrice: b.purchase_price,
                        Value: Number(b.quantity) * Number(b.purchase_price),
                      })),
                    )
                  }
                >
                  <Download className="mr-1.5 size-4" /> Export Batches
                </Button>
              </div>

              {filteredBatches.length === 0 ? (
                <EmptyState
                  title="No batches match current filter"
                  description="Batches are automatically tracked when created via purchases or product batch manager."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch No</TableHead>
                        <TableHead>Product</TableHead>
                        {isMedical && <TableHead>Active Formulation</TableHead>}
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Mfg Date</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Purchase</TableHead>
                        <TableHead className="text-right">MRP</TableHead>
                        <TableHead className="text-right">Selling Price</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBatches.map((b) => {
                        const days = getDaysUntilExpiry(b.expiry_date);
                        const isExpired = days !== null && days < 0;
                        const isNearExpiry = days !== null && days >= 0 && days <= 60;
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-semibold text-sm">{b.batch_number}</TableCell>
                            <TableCell className="text-sm">
                              <div>{b.products?.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{b.products?.sku}</div>
                            </TableCell>
                            {isMedical && (
                              <TableCell className="text-sm text-muted-foreground">
                                {b.products?.active_formulation ? (
                                  <Badge variant="outline" className="font-normal text-xs">
                                    {b.products.active_formulation}
                                  </Badge>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              {b.expiry_date ? (
                                <div>
                                  <Badge
                                    variant={
                                      isExpired
                                        ? "destructive"
                                        : isNearExpiry
                                          ? "outline"
                                          : "secondary"
                                    }
                                    className="font-mono text-xs"
                                  >
                                    {b.expiry_date}
                                  </Badge>
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {days !== null
                                      ? days < 0
                                        ? `Expired ${Math.abs(days)}d ago`
                                        : `${days} days left`
                                      : ""}
                                  </div>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {b.manufacturing_date || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {b.warehouses?.name || "Main Godown"}
                            </TableCell>
                            <TableCell className="tabular text-right text-xs">
                              {inr(b.purchase_price)}
                            </TableCell>
                            <TableCell className="tabular text-right text-xs">
                              {inr(b.mrp)}
                            </TableCell>
                            <TableCell className="tabular text-right text-xs font-medium">
                              {inr(b.selling_price)}
                            </TableCell>
                            <TableCell className="tabular text-right">
                              <Badge
                                variant={
                                  b.quantity <= 0
                                    ? "destructive"
                                    : isExpired
                                      ? "outline"
                                      : "secondary"
                                }
                              >
                                {num(b.quantity)} {b.products?.unit ?? "pcs"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  b.status === "expired" || isExpired
                                    ? "destructive"
                                    : b.status === "active"
                                      ? "secondary"
                                      : "outline"
                                }
                                className="capitalize text-xs"
                              >
                                {isExpired && b.status === "active" ? "Expired" : b.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAdjustBatch(b)}
                              >
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
        )}

        {/* Tab 3: Ledger */}
        <TabsContent value="ledger" className="mt-4">
          <Ledger isMedical={isMedical} />
        </TabsContent>
      </Tabs>

      <AdjustDialog product={adjust} onClose={() => setAdjust(null)} />
      <AdjustBatchDialog batch={adjustBatch} onClose={() => setAdjustBatch(null)} />
      <OpeningStockDialog
        product={openingProduct}
        open={!!openingProduct}
        onOpenChange={(o) => !o && setOpeningProduct(null)}
      />
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
        ...(warehouseId ? { p_warehouse_id: warehouseId } : {}),
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
      void qc.invalidateQueries({ queryKey: ["product_batches"] });
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

function AdjustBatchDialog({
  batch,
  onClose,
}: {
  batch: ProductBatch | null;
  onClose: () => void;
}) {
  const [newQty, setNewQty] = useState(batch?.quantity?.toString() ?? "0");
  const [reason, setReason] = useState("Physical verification / Correction");
  const adjustMutation = useAdjustBatchStock();

  // Reset when batch changes
  useMemo(() => {
    if (batch) {
      setNewQty(batch.quantity.toString());
    }
  }, [batch]);

  const handleAdjust = async () => {
    if (!batch) return;
    const qtyVal = Number(newQty);
    if (isNaN(qtyVal) || qtyVal < 0) {
      toast.error("Please enter a valid quantity (≥ 0)");
      return;
    }

    try {
      await adjustMutation.mutateAsync({
        batchId: batch.id,
        productId: batch.product_id,
        currentQty: batch.quantity,
        newQty: qtyVal,
        warehouseId: batch.warehouse_id,
        reason,
      });
      toast.success(`Batch ${batch.batch_number} stock adjusted to ${qtyVal}`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust batch stock");
    }
  };

  return (
    <Dialog open={!!batch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Batch Stock · Lot {batch?.batch_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">{batch?.products?.name}</p>
            <p className="text-xs text-muted-foreground">
              Expiry: {batch?.expiry_date || "None"} · Current Quantity: {batch?.quantity}
            </p>
          </div>

          <div>
            <Label>New Batch Stock Quantity *</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
            />
          </div>

          <div>
            <Label>Adjustment Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Physical verification / Correction">Physical verification / Correction</SelectItem>
                <SelectItem value="Damaged goods">Damaged goods</SelectItem>
                <SelectItem value="Expired stock quarantine">Expired stock quarantine</SelectItem>
                <SelectItem value="Breakage / Leakage">Breakage / Leakage</SelectItem>
                <SelectItem value="Return to supplier">Return to supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdjust} disabled={adjustMutation.isPending}>
            Save Adjustment
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
  batch_number?: string | null;
  expiry_date?: string | null;
  previous_stock?: number | null;
  new_stock?: number | null;
  products: { name: string; sku: string; unit: string; active_formulation?: string | null } | null;
  product_batches?: { batch_number: string; expiry_date: string | null } | null;
};

function Ledger({ isMedical }: { isMedical?: boolean }) {
  const { data, isLoading } = useInventoryTxns();
  const { godown } = useGodown();
  const { warehouses } = useMyWarehouses();
  const whName = new Map(warehouses.map((w) => [w.id, w.name] as const));
  const rows = (data ?? []) as unknown as Txn[];
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) =>
    [
      r.products?.name,
      r.products?.sku,
      r.products?.active_formulation,
      r.reference_no,
      r.txn_type,
      r.batch_number,
      r.product_batches?.batch_number,
    ].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={
              isMedical
                ? "Search ledger, formulation, batch…"
                : "Search ledger…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
                <TableHead>Batch / Expiry</TableHead>
                {godown && <TableHead>Location</TableHead>}
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Stock (Prev → New)</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const batchNum = r.batch_number || r.product_batches?.batch_number;
                const expiry = r.expiry_date || r.product_batches?.expiry_date;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{dateTimeFmt(r.txn_date)}</TableCell>
                    <TableCell className="text-sm font-medium">
                      <div>{r.products?.name ?? "—"}</div>
                      {isMedical && r.products?.active_formulation && (
                        <div className="text-[11px] text-muted-foreground">
                          {r.products.active_formulation}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {batchNum ? (
                        <div>
                          <Badge variant="outline" className="font-mono text-xs">
                            {batchNum}
                          </Badge>
                          {expiry && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Exp: {expiry}
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {godown && (
                      <TableCell className="text-sm text-muted-foreground">
                        {(r.warehouse_id && whName.get(r.warehouse_id)) || "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-xs">
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
                    <TableCell className="tabular text-right text-xs text-muted-foreground">
                      {r.previous_stock != null && r.new_stock != null
                        ? `${num(r.previous_stock)} → ${num(r.new_stock)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">{inr(r.unit_cost)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
