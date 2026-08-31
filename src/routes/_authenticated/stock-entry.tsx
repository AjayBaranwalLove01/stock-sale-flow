import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/shared";
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
import { toast } from "sonner";
import { Camera, ScanLine, Trash2, PackagePlus } from "lucide-react";
import { BarcodeInput, BarcodeScannerDialog } from "@/components/BarcodeScanner";
import {
  lookupBarcode,
  receiveStockByBarcode,
  useBarcode,
  type BarcodeProduct,
} from "@/lib/barcode";
import { inr, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/stock-entry")({
  head: () => ({
    meta: [
      { title: "Barcode Stock Entry — Ledger ERP" },
      {
        name: "description",
        content: "Receive stock fast by scanning barcodes — quantities post to the existing inventory ledger.",
      },
      { property: "og:title", content: "Barcode Stock Entry — Ledger ERP" },
      {
        property: "og:description",
        content: "Receive stock fast by scanning barcodes — quantities post to the existing inventory ledger.",
      },
    ],
  }),
  component: StockEntryPage,
});

type Line = {
  product_id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  current_stock: number;
  quantity: number;
  purchase_price: string;
  selling_price: string;
};

function StockEntryPage() {
  const qc = useQueryClient();
  const barcode = useBarcode();
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [camera, setCamera] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const handleScan = useCallback(async (code: string) => {
    try {
      const p: BarcodeProduct | null = await lookupBarcode(code);
      if (!p) {
        toast.error(`Barcode not found: ${code}`, {
          description: "Add the product from the Products screen first.",
        });
        return;
      }
      if (p.status !== "active") {
        toast.error(`${p.name} is inactive`);
        return;
      }
      setLast(`${p.name} scanned`);
      setLines((prev) => {
        const i = prev.findIndex((l) => l.product_id === p.id);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i]!, quantity: next[i]!.quantity + 1 };
          return next;
        }
        return [
          ...prev,
          {
            product_id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            unit: p.unit,
            current_stock: Number(p.current_stock),
            quantity: 1,
            purchase_price: String(p.purchase_price),
            selling_price: String(p.selling_price),
          },
        ];
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that barcode");
    }
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      if (!lines.length) throw new Error("Scan at least one product");
      return receiveStockByBarcode(
        lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          purchase_price: l.purchase_price === "" ? null : Number(l.purchase_price),
          selling_price: l.selling_price === "" ? null : Number(l.selling_price),
        })),
        notes,
      );
    },
    onSuccess: (count) => {
      toast.success(`Stock received for ${count} product${count === 1 ? "" : "s"}`);
      setLines([]);
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!barcode.enabled) {
    return (
      <EmptyState
        title="Barcode features are turned off"
        description="Ask your Super Admin to enable Barcode Management for this business."
      />
    );
  }
  if (!barcode.can("barcode_stock_entry")) {
    return (
      <EmptyState
        title="Not authorised"
        description="Your role does not include barcode stock receiving."
      />
    );
  }

  const totalUnits = lines.reduce((a, l) => a + l.quantity, 0);
  const totalCost = lines.reduce((a, l) => a + l.quantity * Number(l.purchase_price || 0), 0);

  return (
    <div>
      <PageHeader
        title="Barcode stock entry"
        description="Scan continuously to receive goods. Everything posts through the normal inventory ledger."
      />

      <Card className="mb-4 p-4">
        <Label htmlFor="stock-scan" className="mb-1.5 flex items-center gap-1.5">
          <ScanLine className="size-4" /> Scan barcode
        </Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <BarcodeInput onScan={(c) => void handleScan(c)} />
          </div>
          <Button type="button" variant="outline" onClick={() => setCamera(true)}>
            <Camera className="mr-1.5 size-4" /> Camera
          </Button>
        </div>
        {last && <p className="mt-2 text-xs text-muted-foreground">{last}</p>}
      </Card>

      <Card className="overflow-hidden py-0">
        {lines.length === 0 ? (
          <EmptyState title="Nothing scanned yet" description="Scan a product barcode to begin." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Current stock</TableHead>
                  <TableHead className="w-[120px]">Quantity</TableHead>
                  <TableHead className="w-[140px]">Purchase price</TableHead>
                  <TableHead className="w-[140px]">Selling price</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.product_id}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {l.sku} · {l.barcode}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {num(l.current_stock)} {l.unit}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? { ...x, quantity: Math.max(0, Number(e.target.value)) } : x,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={l.purchase_price}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, purchase_price: e.target.value } : x)),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={l.selling_price}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, selling_price: e.target.value } : x)),
                          )
                        }
                      />
                    </TableCell>
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3 border-t p-3">
          <div className="min-w-[240px] flex-1">
            <Label htmlFor="stock-notes">Notes</Label>
            <Input
              id="stock-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional reference, e.g. supplier challan no."
            />
          </div>
          <div className="text-right text-sm">
            <div className="text-muted-foreground">
              {lines.length} line{lines.length === 1 ? "" : "s"} · {num(totalUnits)} units
            </div>
            <div className="font-semibold">Cost value {inr(totalCost)}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLines([])} disabled={!lines.length}>
              Clear all
            </Button>
            <Button onClick={() => save.mutate()} disabled={!lines.length || save.isPending}>
              <PackagePlus className="mr-1.5 size-4" /> Receive stock
            </Button>
          </div>
        </div>
      </Card>

      <BarcodeScannerDialog
        open={camera}
        onOpenChange={setCamera}
        onDetected={(c) => void handleScan(c)}
        title="Scan product to receive"
      />
    </div>
  );
}
