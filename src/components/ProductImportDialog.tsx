import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useCategories, useProducts } from "@/lib/queries";
import { downloadCsv } from "@/lib/format";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ParsedRow {
  raw: Record<string, string>;
  errors: string[];
}

const TEMPLATE = [
  {
    Category: "Electronics",
    Subcategory: "Mobile",
    ProductName: "Sample Phone",
    SKU: "SAMPLE-001",
    Barcode: "8901234567890",
    PurchasePrice: "10000",
    SellingPrice: "12999",
    MRP: "14999",
    GST: "18",
    OpeningStock: "10",
    Unit: "Piece",
  },
];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]!);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

export function ProductImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const { data: products } = useProducts();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{
    added: number;
    failed: { name: string; sku: string; error: string }[];
  } | null>(null);

  function validate(raws: Record<string, string>[]) {
    const skus = new Set((products ?? []).map((p) => p.sku.toLowerCase()));
    const barcodes = new Set(
      (products ?? []).filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase()),
    );
    const seen = new Set<string>();
    return raws.map((raw) => {
      const errors: string[] = [];
      const name = raw["ProductName"] || raw["Product Name"] || "";
      const sku = raw["SKU"] || "";
      const catName = (raw["Subcategory"] || raw["Category"] || "").trim();
      if (!name) errors.push("Product name missing");
      if (!sku) errors.push("SKU missing");
      if (sku && skus.has(sku.toLowerCase())) errors.push("Duplicate SKU (already exists)");
      if (sku && seen.has(sku.toLowerCase())) errors.push("Duplicate SKU in file");
      if (sku) seen.add(sku.toLowerCase());
      const bc = raw["Barcode"];
      if (bc && barcodes.has(bc.toLowerCase())) errors.push("Duplicate barcode");
      const cat = (categories ?? []).find(
        (c) => c.name.toLowerCase() === catName.toLowerCase(),
      );
      if (!cat) errors.push(`Unknown category "${catName || "—"}"`);
      return { raw, errors };
    });
  }

  const importRows = useMutation({
    mutationFn: async () => {
      const valid = rows.filter((r) => !r.errors.length);
      if (!valid.length) throw new Error("No valid rows to import");
      for (const r of valid) {
        const catName = (r.raw["Subcategory"] || r.raw["Category"] || "").trim();
        const cat = (categories ?? []).find((c) => c.name.toLowerCase() === catName.toLowerCase())!;
        const opening = Number(r.raw["OpeningStock"] ?? 0) || 0;
        const { data, error } = await supabase
          .from("products")
          .insert({
            name: r.raw["ProductName"] || r.raw["Product Name"]!,
            sku: r.raw["SKU"]!,
            barcode: r.raw["Barcode"] || null,
            category_id: cat.id,
            purchase_price: Number(r.raw["PurchasePrice"] ?? 0) || 0,
            selling_price: Number(r.raw["SellingPrice"] ?? 0) || 0,
            mrp: Number(r.raw["MRP"] ?? 0) || 0,
            gst_rate: Number(r.raw["GST"] ?? 0) || 0,
            unit: r.raw["Unit"] || "Piece",
            opening_stock: opening,
          })
          .select()
          .single();
        if (error) throw error;
        if (opening > 0) {
          await supabase.from("inventory_transactions").insert({
            product_id: data.id,
            txn_type: "opening",
            reference_type: "import",
            reference_no: `IMP-${data.sku}`,
            qty_in: opening,
            unit_cost: Number(r.raw["PurchasePrice"] ?? 0) || 0,
          });
        }
      }
      return valid.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} products imported`);
      setRows([]);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validCount = rows.filter((r) => !r.errors.length).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Columns: Category, Subcategory, ProductName, SKU, Barcode, PurchasePrice, SellingPrice,
            MRP, GST, OpeningStock, Unit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              setRows(validate(parseCsv(text)));
            }}
          />
          <Button variant="outline" onClick={() => downloadCsv("product-import-template.csv", TEMPLATE)}>
            Download template
          </Button>
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex gap-2 text-sm">
              <Badge variant="secondary">{rows.length} rows</Badge>
              <Badge className="bg-success text-success-foreground">{validCount} valid</Badge>
              <Badge variant="destructive">{rows.length - validCount} with errors</Badge>
            </div>
            <Tabs defaultValue={validCount === rows.length ? "valid" : "errors"}>
              <TabsList>
                <TabsTrigger value="valid">Valid ({validCount})</TabsTrigger>
                <TabsTrigger value="errors">
                  With errors ({rows.length - validCount})
                </TabsTrigger>
              </TabsList>
              {(["valid", "errors"] as const).map((tab) => (
                <TabsContent key={tab} value={tab}>
                  <div className="max-h-[45vh] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Issues</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows
                          .map((r, i) => ({ r, i }))
                          .filter(({ r }) =>
                            tab === "valid" ? !r.errors.length : r.errors.length > 0,
                          )
                          .map(({ r, i }) => (
                    <TableRow key={i}>
                      <TableCell>
                        {r.errors.length ? (
                          <AlertCircle className="size-4 text-destructive" />
                        ) : (
                          <CheckCircle2 className="size-4 text-success" />
                        )}
                      </TableCell>
                      <TableCell>{r.raw["ProductName"] || r.raw["Product Name"]}</TableCell>
                      <TableCell className="font-mono text-xs">{r.raw["SKU"]}</TableCell>
                      <TableCell>{r.raw["Subcategory"] || r.raw["Category"]}</TableCell>
                      <TableCell className="text-xs text-destructive">
                        {r.errors.join(", ")}
                      </TableCell>
                    </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!validCount || importRows.isPending}
            onClick={() => importRows.mutate()}
          >
            Import {validCount} products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
