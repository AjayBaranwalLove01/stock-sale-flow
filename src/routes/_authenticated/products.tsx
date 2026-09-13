import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Search, Pencil, Upload, Download, ScanLine, Camera, Wand2, Printer } from "lucide-react";
import { useCategories, useProducts, useSuppliers, logAudit } from "@/lib/queries";
import { inr, num, UNITS, GST_RATES, downloadCsv } from "@/lib/format";
import { ProductImportDialog } from "@/components/ProductImportDialog";
import { MultiImagePicker, Thumb } from "@/components/ImagePicker";
import { fetchGallery, saveGallery, type GalleryImage } from "@/lib/images";
import { BarcodeScannerDialog } from "@/components/BarcodeScanner";
import { BarcodeLabelDialog, type LabelProduct } from "@/components/BarcodeLabel";
import { useActiveBusiness } from "@/hooks/useTenant";
import {
  BARCODE_TYPES,
  generateBarcode,
  guessBarcodeType,
  logBarcodeAudit,
  lookupBarcode,
  normaliseBarcode,
  useBarcode,
  validateBarcode,
} from "@/lib/barcode";


export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products — Ledger ERP" },
      { name: "description", content: "Category-based product master with pricing, GST and stock." },
      { property: "og:title", content: "Products — Ledger ERP" },
      {
        property: "og:description",
        content: "Category-based product master with pricing, GST and stock.",
      },
    ],
  }),
  component: ProductsPage,
});

const emptyProduct = {
  id: "",
  sku: "",
  barcode: "",
  barcode_type: "",
  name: "",
  category_id: "",
  brand: "",
  description: "",
  purchase_price: "0",
  mrp: "0",
  selling_price: "0",
  discount: "0",
  gst_rate: "18",
  tax_inclusive: false,
  hsn_code: "",
  opening_stock: "0",
  min_stock: "0",
  max_stock: "0",
  reorder_level: "0",
  unit: "Piece",
  supplier_id: "none",
  rack: "",
  shelf: "",
  batch_number: "",
  manufacturing_date: "",
  expiry_date: "",
  image_sm: "",
  image_md: "",
  image_lg: "",
  status: "active" as "active" | "inactive",
};


type ProductForm = typeof emptyProduct;

/** Build a short alphanumeric token from a piece of text, e.g. "Basmati Rice" -> "BASRIC". */
function token(text: string, size = 3, words = 2) {
  const parts = (text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, words);
  return parts.map((w) => w.slice(0, size)).join("");
}

/**
 * Suggest up to three unique SKU codes from the category, brand and product name.
 * Anything already used by another product gets a numeric suffix until it is free.
 */
function suggestSkus(opts: {
  name: string;
  brand: string;
  category: string;
  taken: Set<string>;
}): string[] {
  const name = token(opts.name, 3, 2);
  const brand = token(opts.brand, 3, 1);
  const cat = token(opts.category, 3, 1);
  if (!name && !brand && !cat) return [];

  const bases = [
    [cat, name].filter(Boolean).join("-"),
    [brand, name].filter(Boolean).join("-"),
    [cat, brand, name].filter(Boolean).join("-"),
  ].filter((b) => b.length > 1);

  const out: string[] = [];
  for (const base of Array.from(new Set(bases))) {
    let candidate = `${base}-${String(out.length + 1).padStart(3, "0")}`;
    let n = out.length + 1;
    while (opts.taken.has(candidate.toLowerCase()) || out.includes(candidate)) {
      n += 1;
      candidate = `${base}-${String(n).padStart(3, "0")}`;
    }
    out.push(candidate);
  }
  return out.slice(0, 3);
}

function ProductsPage() {
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const { data: products, isLoading } = useProducts();
  const { data: suppliers } = useSuppliers();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [step, setStep] = useState("category");
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const barcode = useBarcode();
  const { data: activeBusiness } = useActiveBusiness();
  const [scanOpen, setScanOpen] = useState(false);
  const [barcodeNote, setBarcodeNote] = useState<string | null>(null);
  const [labelProduct, setLabelProduct] = useState<LabelProduct | null>(null);

  /** SKUs used by other products, for uniqueness checks and suggestions. */
  const takenSkus = useMemo(
    () =>
      new Set(
        (products ?? [])
          .filter((p) => p.id !== form.id)
          .map((p) => (p.sku ?? "").toLowerCase()),
      ),
    [products, form.id],
  );

  const skuSuggestions = useMemo(
    () =>
      suggestSkus({
        name: form.name,
        brand: form.brand,
        category: (categories ?? []).find((c) => c.id === form.category_id)?.name ?? "",
        taken: takenSkus,
      }),
    [form.name, form.brand, form.category_id, categories, takenSkus],
  );

  const skuTaken = form.sku.trim() !== "" && takenSkus.has(form.sku.trim().toLowerCase());


  /** Scanned or typed barcode: block duplicates, otherwise continue creating the product. */
  async function applyBarcode(code: string) {
    const value = normaliseBarcode(code);
    setForm((f) => ({ ...f, barcode: value, barcode_type: f.barcode_type || guessBarcodeType(value) }));
    setBarcodeNote(null);
    try {
      const existing = await lookupBarcode(value);
      if (existing && existing.id !== form.id) {
        setBarcodeNote(
          `Barcode already registered — ${existing.name} (SKU ${existing.sku}, stock ${num(existing.current_stock)} ${existing.unit}).`,
        );
        toast.error("Barcode already registered", {
          description: `${existing.name} · SKU ${existing.sku} · Stock ${num(existing.current_stock)}`,
        });
      } else if (!existing) {
        setBarcodeNote("New barcode — continue filling in the product details.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Barcode lookup failed");
    }
  }

  const catById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );
  /** Flattened depth-first tree (depth 0–3) for filters. */
  const catTree = useMemo(() => {
    const rows: { id: string; name: string; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      if (depth > 3) return;
      for (const c of (categories ?? []).filter((x) => (x.parent_id ?? null) === parent)) {
        rows.push({ id: c.id, name: c.name, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }, [categories]);
  /** Ancestor chain of the selected category, root first. */
  const selectedChain = useMemo(() => {
    const chain: string[] = [];
    let cur = form.category_id ? catById.get(form.category_id) : undefined;
    while (cur) {
      chain.unshift(cur.id);
      cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
    }
    return chain;
  }, [form.category_id, catById]);
  const isUnder = (catId: string | undefined, ancestorId: string) => {
    let cur = catId ? catById.get(catId) : undefined;
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
    }
    return false;
  };


  const save = useMutation({
    mutationFn: async () => {
      if (!form.category_id) throw new Error("Select a category first");
      if (!form.sku.trim() || !form.name.trim()) throw new Error("SKU and product name are required");
      if (normaliseBarcode(form.barcode)) {
        const problem = validateBarcode(form.barcode, form.barcode_type);
        if (problem) throw new Error(problem);
        const clash = await lookupBarcode(form.barcode);
        if (clash && clash.id !== form.id)
          throw new Error(`Barcode already registered to ${clash.name} (SKU ${clash.sku})`);
      }
      const payload = {
        sku: form.sku.trim(),
        barcode: normaliseBarcode(form.barcode) || null,
        barcode_type: normaliseBarcode(form.barcode) ? form.barcode_type || guessBarcodeType(form.barcode) : null,
        name: form.name.trim(),
        category_id: form.category_id,
        brand: form.brand.trim() || null,
        description: form.description.trim() || null,
        purchase_price: Number(form.purchase_price),
        mrp: Number(form.mrp),
        selling_price: Number(form.selling_price),
        discount: Number(form.discount),
        gst_rate: Number(form.gst_rate),
        tax_inclusive: form.tax_inclusive,
        hsn_code: form.hsn_code.trim() || null,
        min_stock: Number(form.min_stock),
        max_stock: Number(form.max_stock),
        reorder_level: Number(form.reorder_level),
        unit: form.unit,
        supplier_id: form.supplier_id === "none" ? null : form.supplier_id,
        rack: form.rack.trim() || null,
        shelf: form.shelf.trim() || null,
        batch_number: form.batch_number.trim() || null,
        manufacturing_date: form.manufacturing_date || null,
        expiry_date: form.expiry_date || null,
        image_sm: gallery[0]?.sm ?? null,
        image_md: gallery[0]?.md ?? null,
        image_lg: gallery[0]?.lg ?? null,
        image_url: gallery[0]?.md ?? null,
        status: form.status,
      };

      if (form.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", form.id);
        if (error) throw error;
        await saveGallery("product", form.id, gallery);
        await logAudit("Products", "Product Updated", form.id, null, payload);
        if (payload.barcode) await logBarcodeAudit("Barcode Saved", form.id, payload.barcode);
      } else {
        const opening = Number(form.opening_stock);
        const { data, error } = await supabase
          .from("products")
          .insert({ ...payload, opening_stock: opening })
          .select()
          .single();
        if (error) throw error;
        if (opening > 0) {
          const { error: te } = await supabase.from("inventory_transactions").insert({
            product_id: data.id,
            txn_type: "opening",
            reference_type: "opening",
            reference_no: `OP-${payload.sku}`,
            qty_in: opening,
            unit_cost: payload.purchase_price,
          });
          if (te) throw te;
        }
        await saveGallery("product", data.id, gallery);
        await logAudit("Products", "Product Created", data.id, null, payload);
        if (payload.barcode)
          await logBarcodeAudit("Product Created Using Barcode", data.id, payload.barcode);
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Product updated" : "Product created");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["category-product-counts"] });
      void qc.invalidateQueries({ queryKey: ["catalog-images"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (products ?? []).filter((p) => {
      const cat = p.categories as { id: string; parent_id: string | null } | null;
      const inCat = catFilter === "all" || isUnder(cat?.id, catFilter);

      const match =
        !s ||
        p.name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        (p.barcode ?? "").toLowerCase().includes(s);
      return inCat && match;
    });
  }, [products, search, catFilter]);

  function openNew() {
    setForm(emptyProduct);
    setGallery([]);
    setStep("category");
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Every product belongs to a category. Add products step by step."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 size-4" />
              Import CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "products.csv",
                  rows.map((p) => ({
                    SKU: p.sku,
                    Barcode: p.barcode,
                    Name: p.name,
                    Category: (p.categories as { name: string } | null)?.name,
                    PurchasePrice: p.purchase_price,
                    SellingPrice: p.selling_price,
                    MRP: p.mrp,
                    GST: p.gst_rate,
                    Stock: p.current_stock,
                    Unit: p.unit,
                  })),
                )
              }
            >
              <Download className="mr-1.5 size-4" />
              Export
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-1.5 size-4" />
              Add Product
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={catFilter === "all" ? "default" : "outline"}
          onClick={() => setCatFilter("all")}
        >
          All
        </Button>
        {catTree.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={catFilter === c.id ? "default" : "outline"}
            onClick={() => setCatFilter(c.id)}
          >
            {c.depth > 0 ? `${"· ".repeat(c.depth)}${c.name}` : c.name}

          </Button>
        ))}
      </div>

      <Card className="overflow-hidden py-0 shadow-none">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by product name, SKU or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState title="No products found" description="Adjust the filters or add a new product." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const stock = Number(p.current_stock);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Thumb path={p.image_sm} alt={p.name} />
                          <div>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.brand ?? "—"}</div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {(p.categories as { name: string } | null)?.name}
                      </TableCell>
                      <TableCell className="tabular text-right">{inr(p.purchase_price)}</TableCell>
                      <TableCell className="tabular text-right">{inr(p.selling_price)}</TableCell>
                      <TableCell className="tabular text-right">{p.gst_rate}%</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            stock <= 0 ? "destructive" : stock <= Number(p.reorder_level) ? "outline" : "secondary"
                          }
                        >
                          {num(stock, 2)} {p.unit}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setForm({
                              ...emptyProduct,
                              id: p.id,
                              sku: p.sku,
                              barcode: p.barcode ?? "",
                              barcode_type: p.barcode_type ?? "",
                              name: p.name,
                              category_id: p.category_id,
                              brand: p.brand ?? "",
                              description: p.description ?? "",
                              purchase_price: String(p.purchase_price),
                              mrp: String(p.mrp),
                              selling_price: String(p.selling_price),
                              discount: String(p.discount),
                              gst_rate: String(p.gst_rate),
                              tax_inclusive: p.tax_inclusive,
                              hsn_code: p.hsn_code ?? "",
                              opening_stock: String(p.opening_stock),
                              min_stock: String(p.min_stock),
                              max_stock: String(p.max_stock),
                              reorder_level: String(p.reorder_level),
                              unit: p.unit,
                              supplier_id: p.supplier_id ?? "none",
                              rack: p.rack ?? "",
                              shelf: p.shelf ?? "",
                              batch_number: p.batch_number ?? "",
                              manufacturing_date: p.manufacturing_date ?? "",
                              expiry_date: p.expiry_date ?? "",
                              image_sm: p.image_sm ?? "",
                              image_md: p.image_md ?? "",
                              image_lg: p.image_lg ?? "",
                              status: p.status,
                            });

                            setGallery([]);
                            void fetchGallery("product", p.id).then((g) => {
                              setGallery(
                                g.length
                                  ? g
                                  : p.image_md
                                    ? [{ sm: p.image_sm ?? "", md: p.image_md, lg: p.image_lg ?? "" }]
                                    : [],
                              );
                            });
                            setStep("info");
                            setOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit product" : "Add product"}</DialogTitle>
            <DialogDescription>
              Choose the category, then fill in product, pricing and inventory details.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={step} onValueChange={setStep}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="category">1. Category</TabsTrigger>
              <TabsTrigger value="info">2. Info</TabsTrigger>
              <TabsTrigger value="pricing">3. Pricing</TabsTrigger>
              <TabsTrigger value="inventory">4. Inventory</TabsTrigger>
              <TabsTrigger value="extra">5. Extra</TabsTrigger>
            </TabsList>

            <TabsContent value="category" className="space-y-4 pt-4">
              <div>
                <Label className="mb-2 block">Select category or subcategory</Label>
                <div className="flex flex-wrap gap-2">
                  {catTree.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={form.category_id === c.id ? "default" : "outline"}
                      onClick={() => setForm({ ...form, category_id: c.id })}
                    >
                      {c.depth > 0 ? `${"— ".repeat(c.depth)}${c.name}` : c.name}
                    </Button>
                  ))}
                </div>
              </div>
              {selectedChain.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedChain.map((id) => catById.get(id)?.name).filter(Boolean).join(" → ")}
                </p>
              )}
              <Button type="button" disabled={!form.category_id} onClick={() => setStep("info")}>
                Continue
              </Button>
            </TabsContent>


            <TabsContent value="info" className="grid gap-3 pt-4 sm:grid-cols-2">
              <F label="Product name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </F>
              <F label="SKU">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                      placeholder="e.g. GRO-BASRIC-001"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={skuSuggestions.length === 0}
                      onClick={() => setForm((f) => ({ ...f, sku: skuSuggestions[0] ?? f.sku }))}
                    >
                      <Wand2 className="mr-1.5 size-4" /> Suggest
                    </Button>
                  </div>
                  {skuSuggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Suggestions:</span>
                      {skuSuggestions.map((s) => (
                        <Button
                          key={s}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 font-mono text-xs"
                          onClick={() => setForm((f) => ({ ...f, sku: s }))}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  )}
                  {skuTaken && (
                    <p className="text-xs text-destructive">
                      This SKU is already used by another product.
                    </p>
                  )}
                </div>
              </F>
              <F label="Barcode" full>
                {barcode.enabled ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="min-w-[200px] flex-1"
                        placeholder="Scan, type or generate a barcode"
                        value={form.barcode}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                        onBlur={(e) => e.target.value && void applyBarcode(e.target.value)}
                      />
                      <Select
                        value={form.barcode_type || "auto"}
                        onValueChange={(v) => setForm({ ...form, barcode_type: v === "auto" ? "" : v })}
                      >
                        <SelectTrigger className="w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Detect type</SelectItem>
                          {BARCODE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {barcode.can("scan_barcode") && (
                        <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
                          <Camera className="mr-1.5 size-4" /> Scan
                        </Button>
                      )}
                      {barcode.can("generate_barcode") && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const code = await generateBarcode(form.id || undefined);
                              setForm((f) => ({ ...f, barcode: code, barcode_type: "CODE128" }));
                              setBarcodeNote(`Internal barcode generated: ${code}`);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Could not generate barcode");
                            }
                          }}
                        >
                          <Wand2 className="mr-1.5 size-4" /> Generate
                        </Button>
                      )}
                      {barcode.can("print_barcode") && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!normaliseBarcode(form.barcode)}
                          onClick={() =>
                            setLabelProduct({
                              name: form.name || "Product",
                              sku: form.sku,
                              barcode: normaliseBarcode(form.barcode),
                              barcode_type: form.barcode_type || null,
                              selling_price: Number(form.selling_price || 0),
                            })
                          }
                        >
                          <Printer className="mr-1.5 size-4" /> Label
                        </Button>
                      )}
                    </div>
                    {barcodeNote && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ScanLine className="size-3.5" /> {barcodeNote}
                      </p>
                    )}
                  </div>
                ) : (
                  <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                )}
              </F>
              <F label="Brand">
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </F>
              <F label="Status">
                <Select
                  value={form.status}
                  onValueChange={(v: "active" | "inactive") => setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Description" full>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </F>
              <div className="sm:col-span-2">
                <MultiImagePicker
                  label="Product images (optional)"
                  folder="products"
                  value={gallery}
                  onChange={setGallery}
                />
              </div>
            </TabsContent>


            <TabsContent value="pricing" className="grid gap-3 pt-4 sm:grid-cols-2">
              <NumF label="Purchase price" v={form.purchase_price} set={(v) => setForm({ ...form, purchase_price: v })} />
              <NumF label="MRP" v={form.mrp} set={(v) => setForm({ ...form, mrp: v })} />
              <NumF label="Selling price" v={form.selling_price} set={(v) => setForm({ ...form, selling_price: v })} />
              <NumF label="Discount (%)" v={form.discount} set={(v) => setForm({ ...form, discount: v })} />
              <F label="GST rate">
                <Select value={form.gst_rate} onValueChange={(v) => setForm({ ...form, gst_rate: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {g}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
              <F label="HSN / SAC">
                <Input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} />
              </F>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  checked={form.tax_inclusive}
                  onCheckedChange={(v) => setForm({ ...form, tax_inclusive: v })}
                />
                <Label>Selling price is tax inclusive</Label>
              </div>
            </TabsContent>

            <TabsContent value="inventory" className="grid gap-3 pt-4 sm:grid-cols-2">
              {!form.id && (
                <NumF
                  label="Opening stock"
                  v={form.opening_stock}
                  set={(v) => setForm({ ...form, opening_stock: v })}
                />
              )}
              <NumF label="Minimum stock" v={form.min_stock} set={(v) => setForm({ ...form, min_stock: v })} />
              <NumF label="Maximum stock" v={form.max_stock} set={(v) => setForm({ ...form, max_stock: v })} />
              <NumF
                label="Reorder level"
                v={form.reorder_level}
                set={(v) => setForm({ ...form, reorder_level: v })}
              />
              <F label="Unit">
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
            </TabsContent>

            <TabsContent value="extra" className="grid gap-3 pt-4 sm:grid-cols-2">
              <F label="Supplier">
                <Select
                  value={form.supplier_id}
                  onValueChange={(v) => setForm({ ...form, supplier_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(suppliers ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
              <F label="Rack">
                <Input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} />
              </F>
              <F label="Shelf">
                <Input value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} />
              </F>
              <F label="Batch number">
                <Input
                  value={form.batch_number}
                  onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                />
              </F>
              <F label="Manufacturing date">
                <Input
                  type="date"
                  value={form.manufacturing_date}
                  onChange={(e) => setForm({ ...form, manufacturing_date: e.target.value })}
                />
              </F>
              <F label="Expiry date">
                <Input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </F>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Save product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <BarcodeScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(code) => void applyBarcode(code)}
        title="Scan product barcode"
      />
      <BarcodeLabelDialog
        product={labelProduct}
        businessName={activeBusiness?.name ?? "Store"}
        onClose={() => setLabelProduct(null)}
      />
    </div>
  );
}

function F({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function NumF({ label, v, set }: { label: string; v: string; set: (v: string) => void }) {
  return (
    <F label={label}>
      <Input type="number" value={v} onChange={(e) => set(e.target.value)} />
    </F>
  );
}
