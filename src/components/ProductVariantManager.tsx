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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, Tag } from "lucide-react";
import {
  useProductVariants,
  useSaveVariant,
  useDeleteVariant,
  type ProductVariant,
} from "@/lib/variants";
import { inr, num } from "@/lib/format";

interface ProductVariantManagerProps {
  productId: string;
  productName: string;
  defaultSku?: string;
  defaultPurchasePrice?: number;
  defaultMrp?: number;
  defaultSellingPrice?: number;
}

export function ProductVariantManager({
  productId,
  productName,
  defaultSku = "",
  defaultPurchasePrice = 0,
  defaultMrp = 0,
  defaultSellingPrice = 0,
}: ProductVariantManagerProps) {
  const { data: variants = [], isLoading } = useProductVariants(productId);
  const saveVariant = useSaveVariant();
  const deleteVariant = useDeleteVariant();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Partial<ProductVariant> | null>(null);
  const [attrSize, setAttrSize] = useState("");
  const [attrColor, setAttrColor] = useState("");
  const [attrCustomKey, setAttrCustomKey] = useState("");
  const [attrCustomVal, setAttrCustomVal] = useState("");

  function openCreate() {
    setEditingVariant({
      product_id: productId,
      variant_name: "",
      sku: defaultSku ? `${defaultSku}-V${variants.length + 1}` : "",
      barcode: "",
      purchase_price: defaultPurchasePrice,
      mrp: defaultMrp,
      selling_price: defaultSellingPrice,
      current_stock: 0,
      attributes: {},
      status: "active",
    });
    setAttrSize("");
    setAttrColor("");
    setAttrCustomKey("");
    setAttrCustomVal("");
    setDialogOpen(true);
  }

  function openEdit(v: ProductVariant) {
    setEditingVariant({ ...v });
    setAttrSize(v.attributes?.["size"] || "");
    setAttrColor(v.attributes?.["color"] || "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editingVariant) return;
    const name = editingVariant.variant_name?.trim();
    if (!name) {
      toast.error("Variant name is required (e.g. Size L / Red)");
      return;
    }

    const attrs: Record<string, string> = { ...(editingVariant.attributes || {}) };
    if (attrSize.trim()) attrs["size"] = attrSize.trim();
    if (attrColor.trim()) attrs["color"] = attrColor.trim();
    if (attrCustomKey.trim() && attrCustomVal.trim()) {
      attrs[attrCustomKey.trim().toLowerCase()] = attrCustomVal.trim();
    }

    try {
      await saveVariant.mutateAsync({
        ...editingVariant,
        variant_name: name,
        attributes: attrs,
      } as any);
      toast.success(editingVariant.id ? "Variant updated" : "Variant added");
      setDialogOpen(false);
      setEditingVariant(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to save variant");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this variant?")) return;
    try {
      await deleteVariant.mutateAsync({ id, productId });
      toast.success("Variant deleted");
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  }

  const totalVariantStock = variants.reduce((s, v) => s + Number(v.current_stock || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <span className="text-sm font-semibold">Product Variants ({variants.length})</span>
            <Badge variant="secondary" className="font-mono text-xs">
              Variant Stock: {num(totalVariantStock)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Different sizes, colors, capacities or styles of this product with independent SKUs and stock.
          </p>
        </div>

        <Button type="button" size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="size-4" /> Add Variant
        </Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading variants…</div>
      ) : variants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <Layers className="size-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">No variants defined yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Add variants if this item comes in different sizes (e.g. S, M, L), colors or options.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={openCreate} className="mt-3">
            <Plus className="mr-1.5 size-3.5" /> Add First Variant
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead className="font-semibold">Variant Name</TableHead>
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Attributes</TableHead>
                <TableHead className="text-right font-semibold">Purchase</TableHead>
                <TableHead className="text-right font-semibold">MRP</TableHead>
                <TableHead className="text-right font-semibold">Selling</TableHead>
                <TableHead className="text-right font-semibold">Stock Qty</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((v) => (
                <TableRow key={v.id} className="text-xs">
                  <TableCell className="font-semibold text-foreground">
                    {v.variant_name}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {v.sku || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(v.attributes || {}).map(([key, val]) => (
                        <Badge key={key} variant="secondary" className="text-[10px] px-1 py-0">
                          {key}: {String(val)}
                        </Badge>
                      ))}
                      {Object.keys(v.attributes || {}).length === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{inr(v.purchase_price)}</TableCell>
                  <TableCell className="text-right font-mono">{inr(v.mrp)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{inr(v.selling_price)}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-foreground">
                    {num(v.current_stock)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Edit Variant"
                        onClick={() => openEdit(v)}
                      >
                        <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:bg-destructive/10"
                        title="Delete Variant"
                        onClick={() => handleDelete(v.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Variant Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVariant?.id ? "Edit Variant" : "Add Variant"}</DialogTitle>
          </DialogHeader>

          {editingVariant && (
            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold">
                  Variant Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g. Size: XL / Navy Blue"
                  value={editingVariant.variant_name || ""}
                  onChange={(e) =>
                    setEditingVariant({ ...editingVariant, variant_name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Variant SKU</Label>
                <Input
                  className="font-mono text-xs"
                  placeholder="e.g. TSH-001-XL"
                  value={editingVariant.sku || ""}
                  onChange={(e) =>
                    setEditingVariant({ ...editingVariant, sku: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Barcode</Label>
                <Input
                  className="font-mono text-xs"
                  placeholder="Optional barcode"
                  value={editingVariant.barcode || ""}
                  onChange={(e) =>
                    setEditingVariant({ ...editingVariant, barcode: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Size</Label>
                <Input
                  placeholder="e.g. XL, 42, 128GB"
                  value={attrSize}
                  onChange={(e) => setAttrSize(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Color / Finish</Label>
                <Input
                  placeholder="e.g. Red, Matte Black"
                  value={attrColor}
                  onChange={(e) => setAttrColor(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Purchase Price (₹)</Label>
                <Input
                  type="number"
                  value={editingVariant.purchase_price !== undefined ? String(editingVariant.purchase_price) : ""}
                  onChange={(e) =>
                    setEditingVariant({ ...editingVariant, purchase_price: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Selling Price (₹)</Label>
                <Input
                  type="number"
                  value={editingVariant.selling_price !== undefined ? String(editingVariant.selling_price) : ""}
                  onChange={(e) =>
                    setEditingVariant({ ...editingVariant, selling_price: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saveVariant.isPending}>
              {saveVariant.isPending ? "Saving…" : "Save Variant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
