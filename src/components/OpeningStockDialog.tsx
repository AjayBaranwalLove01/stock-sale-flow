import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Boxes, Building2, Info, Loader2 } from "lucide-react";
import { useWarehouses } from "@/lib/warehouse";
import {
  getProductOpeningStock,
  saveProductOpeningStock,
} from "@/lib/opening-stock";
import { num } from "@/lib/format";

export interface OpeningStockProduct {
  id: string;
  name: string;
  sku: string;
  unit?: string;
  purchase_price?: number;
  opening_stock?: number;
  current_stock?: number;
}

interface OpeningStockDialogProps {
  product: OpeningStockProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OpeningStockDialog({
  product,
  open,
  onOpenChange,
  onSuccess,
}: OpeningStockDialogProps) {
  const qc = useQueryClient();
  const { data: warehouses = [] } = useWarehouses(true);

  const [isLocationWise, setIsLocationWise] = useState(false);
  const [productLevelQty, setProductLevelQty] = useState("0");
  const [warehouseQtys, setWarehouseQtys] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");

  // Query existing opening stock for the active product
  const {
    data: openingData,
    isLoading: isLoadingOpening,
    refetch,
  } = useQuery({
    queryKey: ["product_opening_stock", product?.id],
    enabled: open && !!product?.id,
    queryFn: () => getProductOpeningStock(product!.id),
  });

  // Populate state when product or opening stock data loads
  useEffect(() => {
    if (!open || !product) {
      setWarehouseQtys({});
      setProductLevelQty("0");
      setRemarks("");
      setIsLocationWise(false);
      return;
    }

    if (openingData) {
      const hasWarehousesWithStock = openingData.records.some(
        (r) => !!r.warehouse_id && Number(r.qty_in) > 0,
      );

      const map: Record<string, string> = {};
      warehouses.forEach((w) => {
        const found = openingData.records.find((r) => r.warehouse_id === w.id);
        map[w.id] = found ? String(found.qty_in) : "0";
      });
      setWarehouseQtys(map);

      const globalRecord = openingData.records.find((r) => !r.warehouse_id);
      const fallbackGlobal = globalRecord
        ? String(globalRecord.qty_in)
        : String(product.opening_stock ?? 0);
      setProductLevelQty(fallbackGlobal);

      // If location-wise records exist or warehouses are present and user has set them
      if (hasWarehousesWithStock) {
        setIsLocationWise(true);
      } else {
        setIsLocationWise(false);
      }
    } else {
      setProductLevelQty(String(product.opening_stock ?? 0));
    }
  }, [open, product, openingData, warehouses]);

  // Compute calculated total
  const calculatedTotal = useMemo(() => {
    if (isLocationWise) {
      return Object.values(warehouseQtys).reduce(
        (acc, val) => acc + Math.max(0, Number(val || 0)),
        0,
      );
    }
    return Math.max(0, Number(productLevelQty || 0));
  }, [isLocationWise, warehouseQtys, productLevelQty]);

  const previousTotal = openingData?.total ?? Number(product?.opening_stock ?? 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!product) return;

      const locQuantities = warehouses.map((w) => ({
        warehouseId: w.id,
        warehouseName: w.name,
        warehouseCode: w.code,
        quantity: Math.max(0, Number(warehouseQtys[w.id] || 0)),
      }));

      return saveProductOpeningStock({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        purchasePrice: Number(product.purchase_price || 0),
        isLocationWise: isLocationWise && warehouses.length > 0,
        locationQuantities: locQuantities,
        productLevelQuantity: Math.max(0, Number(productLevelQty || 0)),
        remarks,
      });
    },
    onSuccess: (res) => {
      toast.success(
        `Opening stock for "${product?.name}" updated to ${num(res?.total ?? 0)} ${product?.unit || "units"}`,
      );
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
      void qc.invalidateQueries({ queryKey: ["warehouse_stock"] });
      void qc.invalidateQueries({ queryKey: ["product_opening_stock", product?.id] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update opening stock");
    },
  });

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Boxes className="size-5" />
            </div>
            <div>
              <DialogTitle>Update Opening Stock</DialogTitle>
              <DialogDescription>
                Set or correct base starting stock for <span className="font-semibold text-foreground">{product.name}</span> ({product.sku}).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoadingOpening ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" /> Loading stock details...
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Context bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg text-sm">
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">Current Registered Opening:</span>
                <div className="font-semibold text-foreground">
                  {num(previousTotal)} {product.unit || "units"}
                </div>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">Current Total Stock:</span>
                <div className="font-semibold text-foreground">
                  {num(product.current_stock ?? 0)} {product.unit || "units"}
                </div>
              </div>
              <div className="space-y-0.5 text-right">
                <span className="text-xs text-muted-foreground">New Opening Quantity:</span>
                <div>
                  <Badge variant="default" className="text-sm px-2.5">
                    {num(calculatedTotal)} {product.unit || "units"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Optional Location-wise toggle */}
            {warehouses.length > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <Building2 className="size-4 text-primary" />
                    <span>Location-wise Opening Quantity</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Distribute starting stock across different Godowns / Branches.
                  </p>
                </div>
                <Switch
                  checked={isLocationWise}
                  onCheckedChange={setIsLocationWise}
                />
              </div>
            )}

            {/* Form controls based on selection */}
            {isLocationWise && warehouses.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Opening Stock by Location / Godown</div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="w-36 text-right">Opening Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warehouses.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="font-medium text-sm">
                            {w.name}
                            {w.code && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({w.code})
                              </span>
                            )}
                            {w.is_default && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                Default
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground capitalize">
                            {w.type?.toLowerCase() || "location"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              className="w-32 ml-auto text-right font-medium"
                              value={warehouseQtys[w.id] ?? "0"}
                              onChange={(e) =>
                                setWarehouseQtys((prev) => ({
                                  ...prev,
                                  [w.id]: e.target.value,
                                }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center px-1 text-xs text-muted-foreground">
                  <span>Sum of location quantities</span>
                  <span className="font-semibold text-foreground">
                    Total: {num(calculatedTotal)} {product.unit || "units"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="opening-qty">Opening / Starting Quantity</Label>
                <div className="relative">
                  <Input
                    id="opening-qty"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={productLevelQty}
                    onChange={(e) => setProductLevelQty(e.target.value)}
                    className="text-lg font-semibold"
                  />
                  {product.unit && (
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                      {product.unit}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Applies globally as base opening stock for this product.
                </p>
              </div>
            )}

            {/* Optional Remarks */}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="opening-remarks">Remarks / Reason (Optional)</Label>
              <Input
                id="opening-remarks"
                placeholder="e.g. Physical inventory count, Initial stock migration..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            {/* Informational callout */}
            <div className="flex gap-2.5 p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 border border-blue-200/50 dark:border-blue-900/50 text-xs">
              <Info className="size-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <div className="space-y-1">
                <div className="font-medium">Direct Opening Stock Adjustment</div>
                <p className="text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
                  Saving will replace the existing opening stock entry without generating a fake purchase or duplicate transaction. Complete change history is preserved in the audit log.
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoadingOpening}
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            Save Opening Stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
