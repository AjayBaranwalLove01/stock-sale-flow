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
import { useActiveBusiness } from "@/hooks/useTenant";
import { isMedicalBusiness } from "@/lib/businessTypes";

interface ParsedRow {
  raw: Record<string, string>;
  errors: string[];
}

const GENERAL_TEMPLATE = [
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

const MEDICAL_TEMPLATE = [
  {
    Category: "Medicines",
    Subcategory: "Antibiotics",
    ProductName: "Amoxicillin 500mg",
    ActiveFormulation: "Amoxicillin 500 mg + Clavulanic Acid 125 mg",
    SKU: "MED-AMX-500",
    Barcode: "8901234567891",
    BatchNumber: "AMX2401",
    ExpiryDate: "2027-12-31",
    PurchasePrice: "85",
    SellingPrice: "120",
    MRP: "140",
    GST: "12",
    OpeningStock: "50",
    Unit: "Strip",
  },
  {
    Category: "Medicines",
    Subcategory: "Analgesics",
    ProductName: "Paracetamol 500mg",
    ActiveFormulation: "Paracetamol 500 mg",
    SKU: "MED-PARA-500",
    Barcode: "8901234567892",
    BatchNumber: "PCM2409",
    ExpiryDate: "2027-06-30",
    PurchasePrice: "15",
    SellingPrice: "25",
    MRP: "30",
    GST: "12",
    OpeningStock: "100",
    Unit: "Strip",
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
  const { data: activeBusiness } = useActiveBusiness();
  const isMedical = isMedicalBusiness(activeBusiness?.business_type);
  const currentTemplate = isMedical ? MEDICAL_TEMPLATE : GENERAL_TEMPLATE;
  const templateFileName = isMedical
    ? "medical-product-import-template.csv"
    : "product-import-template.csv";

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
      const failed: { name: string; sku: string; error: string }[] = [];
      let added = 0;
      setProgress({ done: 0, total: valid.length });
      for (let idx = 0; idx < valid.length; idx++) {
        const r = valid[idx]!;
        const catName = (r.raw["Subcategory"] || r.raw["Category"] || "").trim();
        const cat = (categories ?? []).find((c) => c.name.toLowerCase() === catName.toLowerCase())!;
        const opening = Number(r.raw["OpeningStock"] ?? 0) || 0;
        const activeFormulation =
          r.raw["ActiveFormulation"] ||
          r.raw["Active Formulation"] ||
          r.raw["active_formulation"] ||
          r.raw["Formulation"] ||
          null;
        const batchNumber =
          r.raw["BatchNumber"] ||
          r.raw["Batch Number"] ||
          r.raw["Batch"] ||
          (isMedical && opening > 0 ? `LOT-${r.raw["SKU"]}` : null);
        const expiryDate =
          r.raw["ExpiryDate"] ||
          r.raw["Expiry Date"] ||
          r.raw["Expiry"] ||
          null;

        try {
          const { data, error } = await supabase
            .from("products")
            .insert({
              name: r.raw["ProductName"] || r.raw["Product Name"]!,
              sku: r.raw["SKU"]!,
              barcode: r.raw["Barcode"] || null,
              category_id: cat.id,
              subcategory: r.raw["Subcategory"] || null,
              active_formulation: activeFormulation ? activeFormulation.trim() : null,
              has_batches: isMedical,
              purchase_price: Number(r.raw["PurchasePrice"] ?? 0) || 0,
              selling_price: Number(r.raw["SellingPrice"] ?? 0) || 0,
              mrp: Number(r.raw["MRP"] ?? 0) || 0,
              gst_rate: Number(r.raw["GST"] ?? 0) || 0,
              unit: r.raw["Unit"] || (isMedical ? "Strip" : "Piece"),
              opening_stock: opening,
            })
            .select()
            .single();
          if (error) throw error;

          let batchId: string | null = null;
          if (isMedical && opening > 0 && batchNumber) {
            try {
              const res = (await (supabase.from("product_batches" as any) as any)
                .insert({
                  business_id: data.business_id,
                  product_id: data.id,
                  batch_number: batchNumber,
                  expiry_date: expiryDate,
                  purchase_price: Number(r.raw["PurchasePrice"] ?? 0) || 0,
                  mrp: Number(r.raw["MRP"] ?? 0) || 0,
                  sale_price: Number(r.raw["SellingPrice"] ?? 0) || 0,
                  quantity: opening,
                  status: "active",
                })
                .select("id")
                .single()) as { data?: { id?: string } | null };
              if (res?.data?.id) batchId = res.data.id;
            } catch (err) {
              console.warn("Could not create batch during import:", err);
            }
          }

          if (opening > 0) {
            const txnPayload: any = {
              product_id: data.id,
              txn_type: "opening",
              reference_type: "import",
              reference_no: `IMP-${data.sku}`,
              qty_in: opening,
              unit_cost: Number(r.raw["PurchasePrice"] ?? 0) || 0,
            };
            if (batchId) txnPayload.batch_id = batchId;
            if (batchNumber) {
              txnPayload.notes = `Batch: ${batchNumber}${expiryDate ? ` | Exp: ${expiryDate}` : ""}`;
            }

            const { error: txErr } = await supabase.from("inventory_transactions").insert(txnPayload);
            if (txErr) throw txErr;
          }
          added++;
        } catch (e) {
          failed.push({
            name: r.raw["ProductName"] || r.raw["Product Name"] || "—",
            sku: r.raw["SKU"] || "—",
            error: e instanceof Error ? e.message : "Import failed",
          });
        }
        setProgress({ done: idx + 1, total: valid.length });
      }
      return { added, failed };
    },
    onSuccess: ({ added, failed }) => {
      setProgress(null);
      setResult({ added, failed });
      setRows([]);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["product-categories"] });
      void qc.invalidateQueries({ queryKey: ["category-product-counts"] });
      void qc.invalidateQueries({ queryKey: ["product_batches"] });
    },
    onError: (e: Error) => {
      setProgress(null);
      toast.error(e.message);
    },
  });

  const validCount = rows.filter((r) => !r.errors.length).length;
  const importedCount = progress ? progress.done : (result?.added ?? 0);
  const hasFormulationInRows = rows.some(
    (r) => r.raw["ActiveFormulation"] || r.raw["Active Formulation"] || r.raw["active_formulation"],
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Import products from CSV {isMedical && <Badge variant="secondary" className="ml-2 font-normal">Medical / Pharmacy</Badge>}
          </DialogTitle>
          <DialogDescription>
            {isMedical
              ? "Columns: Category, Subcategory, ProductName, ActiveFormulation, SKU, Barcode, BatchNumber, ExpiryDate, PurchasePrice, SellingPrice, MRP, GST, OpeningStock, Unit."
              : "Columns: Category, Subcategory, ProductName, SKU, Barcode, PurchasePrice, SellingPrice, MRP, GST, OpeningStock, Unit."}
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
          <Button variant="outline" onClick={() => downloadCsv(templateFileName, currentTemplate)}>
            Download {isMedical ? "Medical template" : "Template"}
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
                          {(isMedical || hasFormulationInRows) && (
                            <TableHead>Active Formulation</TableHead>
                          )}
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
                      <TableCell className="font-medium">
                        {r.raw["ProductName"] || r.raw["Product Name"]}
                      </TableCell>
                      {(isMedical || hasFormulationInRows) && (
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {r.raw["ActiveFormulation"] ||
                            r.raw["Active Formulation"] ||
                            r.raw["active_formulation"] ||
                            "—"}
                        </TableCell>
                      )}
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

        {progress && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span>Importing products…</span>
              <span className="font-medium">
                {progress.done} of {progress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importRows.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!validCount || importRows.isPending}
            onClick={() => importRows.mutate()}
          >
            {importRows.isPending
              ? `Importing ${importedCount} of ${progress?.total ?? validCount}…`
              : `Import ${validCount} products`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" />
            Import complete
          </DialogTitle>
          <DialogDescription>
            {result && result.added > 0
              ? `${result.added} ${result.added === 1 ? "product was" : "products were"} uploaded successfully.`
              : "No products were uploaded."}
          </DialogDescription>
        </DialogHeader>
        {result && result.failed.length > 0 && (
          <div className="rounded-md border">
            <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
              Could not upload ({result.failed.length})
            </div>
            <div className="max-h-48 overflow-auto p-3 text-xs">
              {result.failed.map((f, i) => (
                <div key={i} className="py-1">
                  <span className="font-medium">{f.name}</span>
                  {f.sku !== "—" && <span className="font-mono"> ({f.sku})</span>}:{" "}
                  <span className="text-destructive">{f.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => setResult(null)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
