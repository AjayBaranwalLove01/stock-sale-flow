import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Boxes,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import {
  useProductBatches,
  useSaveBatch,
  useAdjustBatchStock,
  getExpiryCategory,
  getDaysUntilExpiry,
  type ProductBatch,
} from "@/lib/batches";
import { useWarehouses } from "@/lib/warehouse";
import { useSuppliers } from "@/lib/queries";
import { inr, num, dateFmt } from "@/lib/format";

interface ProductBatchManagerProps {
  productId: string;
  productName: string;
  defaultPurchasePrice?: number;
  defaultMrp?: number;
  defaultSellingPrice?: number;
  defaultGstRate?: number;
}

export function ProductBatchManager({
  productId,
  productName,
  defaultPurchasePrice = 0,
  defaultMrp = 0,
  defaultSellingPrice = 0,
  defaultGstRate = 0,
}: ProductBatchManagerProps) {
  const { data: batches = [], isLoading } = useProductBatches(productId);
  const { data: warehouses = [] } = useWarehouses(true);
  const { data: suppliers = [] } = useSuppliers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Partial<ProductBatch> | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<ProductBatch | null>(null);
  const [adjustNewQty, setAdjustNewQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("Inventory count correction");

  const saveBatch = useSaveBatch();
  const adjustStock = useAdjustBatchStock();

  function openCreate() {
    setEditingBatch({
      product_id: productId,
      batch_number: "",
      manufacturing_date: "",
      expiry_date: "",
      purchase_price: defaultPurchasePrice,
      mrp: defaultMrp,
      selling_price: defaultSellingPrice,
      gst_rate: defaultGstRate,
      quantity: 0,
      warehouse_id: warehouses[0]?.id || null,
      supplier_id: null,
      status: "active",
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEdit(b: ProductBatch) {
    setEditingBatch({ ...b });
    setDialogOpen(true);
  }

  function openAdjust(b: ProductBatch) {
    setAdjustTarget(b);
    setAdjustNewQty(String(b.quantity));
    setAdjustReason("Stock count verification");
    setAdjustOpen(true);
  }

  async function handleSave() {
    if (!editingBatch) return;
    if (!editingBatch.batch_number?.trim()) {
      toast.error("Batch number is required");
      return;
    }
    try {
      await saveBatch.mutateAsync(editingBatch as any);
      toast.success(editingBatch.id ? "Batch updated" : "New batch added");
      setDialogOpen(false);
      setEditingBatch(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to save batch");
    }
  }

  async function handleAdjust() {
    if (!adjustTarget) return;
    const newQ = Number(adjustNewQty);
    if (isNaN(newQ) || newQ < 0) {
      toast.error("Enter a valid non-negative quantity");
      return;
    }
    try {
      await adjustStock.mutateAsync({
        batchId: adjustTarget.id,
        productId: adjustTarget.product_id,
        currentQty: Number(adjustTarget.quantity),
        newQty: newQ,
        warehouseId: adjustTarget.warehouse_id,
        reason: adjustReason,
      });
      toast.success("Batch quantity adjusted");
      setAdjustOpen(false);
      setAdjustTarget(null);
    } catch (e: any) {
      toast.error(e.message || "Adjustment failed");
    }
  }

  const totalBatchStock = batches.reduce((s, b) => s + Number(b.quantity || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-primary" />
            <span className="text-sm font-semibold">Active Batches ({batches.length})</span>
            <Badge variant="secondary" className="font-mono text-xs">
              Total Stock: {num(totalBatchStock)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage lots, manufacturing & expiry dates, MRP and individual batch quantities.
          </p>
        </div>

        <Button type="button" size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="size-4" /> Add Batch
        </Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading batches…</div>
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <Boxes className="size-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">No batches created yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Batches are automatically created during purchase goods receipts, or you can add initial opening batches here.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={openCreate} className="mt-3">
            <Plus className="mr-1.5 size-3.5" /> Add First Batch
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead className="font-semibold">Batch No.</TableHead>
                <TableHead className="font-semibold">Mfg Date</TableHead>
                <TableHead className="font-semibold">Expiry Date</TableHead>
                <TableHead className="text-right font-semibold">Purchase</TableHead>
                <TableHead className="text-right font-semibold">MRP</TableHead>
                <TableHead className="text-right font-semibold">Selling</TableHead>
                <TableHead className="font-semibold">Location</TableHead>
                <TableHead className="text-right font-semibold">Stock Qty</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const expCategory = getExpiryCategory(b.expiry_date);
                const daysLeft = getDaysUntilExpiry(b.expiry_date);
                const locName = warehouses.find((w) => w.id === b.warehouse_id)?.name ?? "Default";

                return (
                  <TableRow key={b.id} className="text-xs">
                    <TableCell className="font-mono font-bold text-foreground">
                      {b.batch_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.manufacturing_date ? dateFmt(b.manufacturing_date) : "—"}
                    </TableCell>
                    <TableCell>
                      {b.expiry_date ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={
                              expCategory === "expired"
                                ? "text-destructive font-bold"
                                : expCategory === "d30"
                                  ? "text-amber-600 font-semibold"
                                  : "text-foreground"
                            }
                          >
                            {dateFmt(b.expiry_date)}
                          </span>
                          {expCategory === "expired" && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                              Expired
                            </Badge>
                          )}
                          {expCategory === "d30" && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1 py-0 h-4">
                              {daysLeft}d left
                            </Badge>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{inr(b.purchase_price)}</TableCell>
                    <TableCell className="text-right font-mono">{inr(b.mrp)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{inr(b.selling_price)}</TableCell>
                    <TableCell className="text-muted-foreground">{locName}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground">
                      {num(b.quantity)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          b.status === "active"
                            ? "default"
                            : b.status === "expired"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-[10px] uppercase capitalize"
                      >
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Adjust Stock"
                          onClick={() => openAdjust(b)}
                        >
                          <SlidersHorizontal className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Edit Batch"
                          onClick={() => openEdit(b)}
                        >
                          <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
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

      {/* Add / Edit Batch Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBatch?.id ? "Edit Batch" : "Add New Batch"}</DialogTitle>
          </DialogHeader>

          {editingBatch && (
            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold">
                  Batch Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  className="font-mono"
                  placeholder="e.g. B10492"
                  value={editingBatch.batch_number || ""}
                  onChange={(e) =>
                    setEditingBatch({ ...editingBatch, batch_number: e.target.value.toUpperCase() })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Manufacturing Date</Label>
                <Input
                  type="date"
                  value={editingBatch.manufacturing_date || ""}
                  onChange={(e) =>
                    setEditingBatch({ ...editingBatch, manufacturing_date: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Expiry Date</Label>
                <Input
                  type="date"
                  value={editingBatch.expiry_date || ""}
                  onChange={(e) =>
                    setEditingBatch({ ...editingBatch, expiry_date: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Purchase Price (₹)</Label>
                <Input
                  type="number"
                  value={editingBatch.purchase_price !== undefined ? String(editingBatch.purchase_price) : ""}
                  onChange={(e) =>
                    setEditingBatch({ ...editingBatch, purchase_price: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">MRP (₹)</Label>
                <Input
                  type="number"
                  value={editingBatch.mrp !== undefined ? String(editingBatch.mrp) : ""}
                  onChange={(e) =>
                    setEditingBatch({ ...editingBatch, mrp: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Selling Price (₹)</Label>
                <Input
                  type="number"
                  value={editingBatch.selling_price !== undefined ? String(editingBatch.selling_price) : ""}
                  onChange={(e) =>
                    setEditingBatch({ ...editingBatch, selling_price: Number(e.target.value) })
                  }
                />
              </div>

              {!editingBatch.id && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Initial Quantity</Label>
                  <Input
                    type="number"
                    value={editingBatch.quantity !== undefined ? String(editingBatch.quantity) : "0"}
                    onChange={(e) =>
                      setEditingBatch({ ...editingBatch, quantity: Number(e.target.value) })
                    }
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Location / Godown</Label>
                <Select
                  value={editingBatch.warehouse_id || "none"}
                  onValueChange={(v) =>
                    setEditingBatch({ ...editingBatch, warehouse_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default Location</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Supplier</Label>
                <Select
                  value={editingBatch.supplier_id || "none"}
                  onValueChange={(v) =>
                    setEditingBatch({ ...editingBatch, supplier_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Notes / Batch Remarks</Label>
                <Input
                  placeholder="Optional remarks"
                  value={editingBatch.notes || ""}
                  onChange={(e) =>
                    setEditingBatch({ ...editingBatch, notes: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saveBatch.isPending}>
              {saveBatch.isPending ? "Saving…" : "Save Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Batch Stock Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Batch Stock</DialogTitle>
          </DialogHeader>

          {adjustTarget && (
            <div className="space-y-3 pt-2">
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-semibold text-foreground">{productName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Batch Number:</span>
                  <span className="font-mono font-bold text-foreground">{adjustTarget.batch_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Stock:</span>
                  <span className="font-bold text-primary">{num(adjustTarget.quantity)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">New Correct Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  value={adjustNewQty}
                  onChange={(e) => setAdjustNewQty(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Reason for Adjustment</Label>
                <Select value={adjustReason} onValueChange={setAdjustReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Physical inventory count correction">
                      Physical inventory count correction
                    </SelectItem>
                    <SelectItem value="Damaged / broken goods">Damaged / broken goods</SelectItem>
                    <SelectItem value="Expired goods write-off">Expired goods write-off</SelectItem>
                    <SelectItem value="Customer return without invoice">
                      Customer return without invoice
                    </SelectItem>
                    <SelectItem value="Theft or shortage">Theft or shortage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAdjust} disabled={adjustStock.isPending}>
              {adjustStock.isPending ? "Adjusting…" : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
