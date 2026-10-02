import { createFileRoute, Link } from "@tanstack/react-router";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Upload,
  Download,
  ScanLine,
  Camera,
  Wand2,
  Printer,
  Trash2,
  Folder,
  FolderTree,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Layers,
  Boxes,
  Pill,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  useCategories,
  useProducts,
  useSuppliers,
  logAudit,
  useProductCategoryLinks,
  syncProductCategories,
} from "@/lib/queries";

import { inr, num, UNITS, GST_RATES, downloadCsv } from "@/lib/format";
import { ProductImportDialog } from "@/components/ProductImportDialog";
import { OpeningStockDialog, type OpeningStockProduct } from "@/components/OpeningStockDialog";
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
import {
  isMedicalBusiness,
  isClothingBusiness,
  isElectronicsBusiness,
  isGroceryBusiness,
  type BusinessTypeFields,
} from "@/lib/businessTypes";
import { BusinessSpecificFields } from "@/components/BusinessSpecificFields";
import { ProductBatchManager } from "@/components/ProductBatchManager";
import { ProductVariantManager } from "@/components/ProductVariantManager";


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
  subcategory: "",
  brand: "",
  description: "",
  active_formulation: "",
  business_type_data: {} as BusinessTypeFields,
  has_batches: false,
  has_variants: false,
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
  const { data: catLinks } = useProductCategoryLinks();
  const [categorySearch, setCategorySearch] = useState("");
  const [activeParentId, setActiveParentId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [step, setStep] = useState("category");
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const barcode = useBarcode();
  const { data: activeBusiness } = useActiveBusiness();
  const isMedical = isMedicalBusiness(activeBusiness?.business_type);
  const [scanOpen, setScanOpen] = useState(false);
  const [barcodeNote, setBarcodeNote] = useState<string | null>(null);
  const [labelProduct, setLabelProduct] = useState<LabelProduct | null>(null);
  const [openingStockProduct, setOpeningStockProduct] = useState<OpeningStockProduct | null>(null);
  const { roles } = useAuth();
  const canDelete = roles.includes("admin") || roles.includes("super_admin");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; sku: string } | null>(
    null,
  );

  const remove = useMutation({
    mutationFn: async (p: { id: string; name: string; sku: string }) => {
      await supabase.from("product_categories").delete().eq("product_id", p.id);
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) {
        if (error.code === "23503")
          throw new Error(
            "This product is used in purchases, sales or stock records and cannot be deleted. Set it to Inactive instead.",
          );
        throw error;
      }
      await logAudit("Products", "Product Deleted", p.id, { name: p.name, sku: p.sku }, null);
    },
    onSuccess: () => {
      toast.success("Product deleted");
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["product-categories"] });
      void qc.invalidateQueries({ queryKey: ["category-product-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const getCategoryRoot = (catId?: string | null): string | null => {
    if (!catId) return null;
    let cur = catById.get(catId);
    while (cur && cur.parent_id) {
      cur = catById.get(cur.parent_id);
    }
    return cur?.id ?? null;
  };

  const getCategoryPath = (catId?: string | null): string => {
    if (!catId) return "";
    const chain: string[] = [];
    let cur = catById.get(catId);
    while (cur) {
      chain.unshift(cur.name);
      cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
    }
    return chain.join(" ➔ ");
  };

  const rootCategories = useMemo(
    () => (categories ?? []).filter((c) => !c.parent_id),
    [categories],
  );

  const getSubcategories = (parentId: string) => {
    return (categories ?? []).filter((c) => c.parent_id === parentId);
  };

  const categorySearchResults = useMemo(() => {
    if (!categorySearch.trim()) return [];
    const query = categorySearch.toLowerCase().trim();
    return (categories ?? [])
      .map((c) => ({
        category: c,
        path: getCategoryPath(c.id),
      }))
      .filter(
        (item) =>
          item.category.name.toLowerCase().includes(query) ||
          item.path.toLowerCase().includes(query),
      );
  }, [categories, categorySearch, catById]);

  const activeParent = useMemo(() => {
    if (activeParentId) {
      const p = catById.get(activeParentId);
      if (p) return p;
    }
    if (form.category_id) {
      const rootId = getCategoryRoot(form.category_id);
      if (rootId) {
        const root = catById.get(rootId);
        if (root) return root;
      }
    }
    return rootCategories[0] ?? null;
  }, [activeParentId, form.category_id, catById, rootCategories]);

  const activeSubcategories = useMemo(() => {
    if (!activeParent) return [];
    return (categories ?? []).filter((c) => c.parent_id === activeParent.id);
  }, [activeParent, categories]);


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
      const payload: any = {
        sku: form.sku.trim(),
        barcode: normaliseBarcode(form.barcode) || null,
        barcode_type: normaliseBarcode(form.barcode) ? form.barcode_type || guessBarcodeType(form.barcode) : null,
        name: form.name.trim(),
        category_id: form.category_id,
        subcategory: form.subcategory?.trim() || null,
        brand: form.brand.trim() || null,
        description: form.description.trim() || null,
        active_formulation: form.active_formulation?.trim() || null,
        business_type_data: form.business_type_data || {},
        has_batches: form.has_batches || isMedicalBusiness(activeBusiness?.business_type),
        has_variants: form.has_variants,
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

      const existingExtraCats = form.id
        ? (catsByProduct.get(form.id) ?? []).filter((c) => c !== form.category_id)
        : [];
      const allCats = [...new Set([form.category_id, ...existingExtraCats])];

      if (form.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", form.id);
        if (error) throw error;
        await saveGallery("product", form.id, gallery);
        const bid =
          (products ?? []).find((p) => p.id === form.id)?.business_id ?? activeBusiness?.id;
        if (bid) await syncProductCategories(form.id, bid, allCats);
        await logAudit("Products", "Product Updated", form.id, null, {
          ...payload,
          categories: allCats,
        });
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
        await syncProductCategories(data.id, data.business_id, allCats);
        await logAudit("Products", "Product Created", data.id, null, {
          ...payload,
          categories: allCats,
        });
        if (payload.barcode)
          await logBarcodeAudit("Product Created Using Barcode", data.id, payload.barcode);
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Product updated" : "Product created");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["category-product-counts"] });
      void qc.invalidateQueries({ queryKey: ["product-categories"] });
      void qc.invalidateQueries({ queryKey: ["catalog-images"] });
    },

    onError: (e: Error) => toast.error(e.message),
  });

  /** Product id -> all category ids it is mapped to. */
  const catsByProduct = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of catLinks ?? [])
      map.set(l.product_id, [...(map.get(l.product_id) ?? []), l.category_id]);
    return map;
  }, [catLinks]);

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (products ?? []).filter((p) => {
      const cat = p.categories as { id: string; parent_id: string | null } | null;
      const mapped = catsByProduct.get(p.id) ?? [];
      const inCat =
        catFilter === "all" ||
        isUnder(cat?.id, catFilter) ||
        mapped.some((c) => isUnder(c, catFilter));

      const formMatch = ((p as any).active_formulation ?? "").toLowerCase().includes(s);
      const batchMatch = ((p as any).batch_number ?? "").toLowerCase().includes(s);
      const brandMatch = ((p as any).brand ?? "").toLowerCase().includes(s);
      const subcatMatch = ((p as any).subcategory ?? "").toLowerCase().includes(s);

      const match =
        !s ||
        p.name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        (p.barcode ?? "").toLowerCase().includes(s) ||
        formMatch ||
        batchMatch ||
        brandMatch ||
        subcatMatch;
      return inCat && match;
    });
  }, [products, search, catFilter, catsByProduct]);

  // ----- Pagination (same pattern as the leads page) -----
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoValue, setGotoValue] = useState("");
  const resetPage = () => setPage(1);

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );

  const paginationBar = (
    <Card className="mt-3 flex flex-wrap items-center gap-3 justify-between p-3 shadow-none">
      <div className="text-sm text-muted-foreground">
        Showing <strong>{totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalCount)}</strong> of{" "}
        <strong>{totalCount.toLocaleString()}</strong> products
        {products && products.length !== totalCount && (
          <span className="ml-1 text-xs text-muted-foreground">
            (filtered from {products.length.toLocaleString()} total)
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              resetPage();
            }}
          >
            <SelectTrigger className="w-[85px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="250">250</SelectItem>
              <SelectItem value="500">500</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(1)}>
            First
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            Prev
          </Button>
          <span className="px-2 text-sm">
            Page {safePage} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={safePage >= totalPages}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={safePage >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            Last
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-[80px]"
            placeholder="Go to"
            value={gotoValue}
            onChange={(e) => setGotoValue(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const p = Number(gotoValue);
                if (p >= 1 && p <= totalPages) {
                  setPage(p);
                  setGotoValue("");
                }
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const p = Number(gotoValue);
              if (p >= 1 && p <= totalPages) {
                setPage(p);
                setGotoValue("");
              }
            }}
          >
            Go
          </Button>
        </div>
      </div>
    </Card>
  );

  function openNew() {
    setForm(emptyProduct);
    setGallery([]);
    setStep("category");
    setCategorySearch("");
    setActiveParentId(null);
    setOpen(true);
  }


  return (
    <div>
      <PageHeader
        title="Products"
        description={
          products
            ? `Manage your catalog (${products.length.toLocaleString()} total products). Add products step by step.`
            : "Every product belongs to a category. Add products step by step."
        }
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

      <div className="mb-4">
        <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); resetPage(); }}>
          <SelectTrigger className="w-full sm:w-[320px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent className="max-h-[320px]">
            <SelectItem value="all">All categories</SelectItem>
            {catTree.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.depth > 0 ? `${" ".repeat(c.depth * 4)}↳ ${c.name}` : c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0 shadow-none">
        <div className="border-b p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by product name, SKU or barcode…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {isLoading ? (
              <span>Loading products…</span>
            ) : (
              <span>
                Showing <strong>{totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalCount)}</strong> of <strong>{totalCount.toLocaleString()}</strong> products
                {products && products.length !== totalCount && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (out of {products.length.toLocaleString()} total)
                  </span>
                )}
              </span>
            )}
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
                  {isMedical && <TableHead>Active Formulation</TableHead>}
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((p) => {
                  const stock = Number(p.current_stock);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Thumb path={p.image_sm} alt={p.name} />
                          <div>
                            <div className="font-medium flex items-center gap-1.5">
                              {p.name}
                              {(p as any).has_batches && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/40 text-primary">
                                  Batches
                                </Badge>
                              )}
                              {(p as any).has_variants && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-purple-400 text-purple-600">
                                  Variants
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.brand ?? "—"} {p.sku ? `· ${p.sku}` : ""}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {isMedical && (
                        <TableCell>
                          {(p as any).active_formulation ? (
                            <div className="flex items-center gap-1.5 font-medium text-xs text-primary max-w-[200px] truncate" title={(p as any).active_formulation}>
                              <Pill className="size-3.5 shrink-0" />
                              <span className="truncate">{(p as any).active_formulation}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      )}

                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {(catsByProduct.get(p.id)?.length
                            ? catsByProduct.get(p.id)!
                            : [p.category_id]
                          ).map((cid) => (
                            <Badge
                              key={cid}
                              variant={cid === p.category_id ? "secondary" : "outline"}
                            >
                              {catById.get(cid)?.name ?? "—"}
                            </Badge>
                          ))}
                        </div>
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
                              subcategory: (p as any).subcategory ?? "",
                              brand: p.brand ?? "",
                              description: p.description ?? "",
                              active_formulation: (p as any).active_formulation ?? "",
                              business_type_data: ((p as any).business_type_data as BusinessTypeFields) ?? {},
                              has_batches: !!(p as any).has_batches,
                              has_variants: !!(p as any).has_variants,
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

                            setCategorySearch("");
                            setActiveParentId(getCategoryRoot(p.category_id));
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
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Opening Stock"
                          aria-label={`Opening stock for ${p.name}`}
                          onClick={() =>
                            setOpeningStockProduct({
                              id: p.id,
                              name: p.name,
                              sku: p.sku,
                              unit: p.unit,
                              purchase_price: Number(p.purchase_price || 0),
                              opening_stock: Number(p.opening_stock || 0),
                              current_stock: Number(p.current_stock || 0),
                            })
                          }
                        >
                          <Boxes className="size-4 text-primary" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${p.name}`}
                            onClick={() =>
                              setDeleteTarget({ id: p.id, name: p.name, sku: p.sku })
                            }
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      {paginationBar}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit product" : "Add product"}</DialogTitle>
            <DialogDescription>
              Choose the category, then fill in product, pricing and inventory details.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={step} onValueChange={setStep}>
            <TabsList className="grid w-full grid-cols-4 sm:grid-cols-7 text-xs">
              <TabsTrigger value="category">1. Category</TabsTrigger>
              <TabsTrigger value="info">2. Info</TabsTrigger>
              <TabsTrigger value="business">
                3. {isMedical ? "Medical" : "Business"}
              </TabsTrigger>
              <TabsTrigger value="pricing">4. Pricing</TabsTrigger>
              <TabsTrigger value="inventory">5. Inventory</TabsTrigger>
              <TabsTrigger value="batches" disabled={!form.id}>
                6. Batches
              </TabsTrigger>
              <TabsTrigger value="variants" disabled={!form.id}>
                7. Variants
              </TabsTrigger>
            </TabsList>

            <TabsContent value="category" className="space-y-4 pt-4">
              {/* Category Search Bar */}
              <div className="relative">
                <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9 text-sm"
                  placeholder="Search category or subcategory name..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                />
                {categorySearch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 size-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setCategorySearch("")}
                  >
                    ✕
                  </Button>
                )}
              </div>

              {/* Search Results Mode */}
              {categorySearch.trim() ? (
                <div className="rounded-lg border bg-card p-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
                    Search Results ({categorySearchResults.length})
                  </div>
                  <div className="max-h-[300px] overflow-y-auto space-y-1 mt-1">
                    {categorySearchResults.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        No category found matching "{categorySearch}".
                      </p>
                    ) : (
                      categorySearchResults.map(({ category: c, path }) => {
                        const isSelected = form.category_id === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`w-full flex items-center justify-between text-left p-2.5 rounded-md text-sm transition-colors ${
                              isSelected
                                ? "bg-primary/10 border border-primary/40 font-medium text-primary"
                                : "hover:bg-muted border border-transparent"
                            }`}
                            onClick={() => {
                              setForm({ ...form, category_id: c.id });
                              setActiveParentId(getCategoryRoot(c.id));
                            }}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <Folder className="size-4 shrink-0 text-primary/70" />
                              <div className="truncate">
                                <span className="font-medium text-foreground">{c.name}</span>
                                <p className="text-xs text-muted-foreground truncate">{path}</p>
                              </div>
                            </div>
                            {isSelected && (
                              <Badge variant="default" className="text-[10px] gap-1 px-2 py-0.5 shrink-0 ml-2">
                                <CheckCircle2 className="size-3" /> Selected
                              </Badge>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* Cascading 2-Panel Mode */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-2.5">
                  {/* Panel 1: Main Category */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        1. Main Category
                      </Label>
                      <span className="text-[11px] text-muted-foreground">
                        {rootCategories.length} categories
                      </span>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
                      {rootCategories.map((c) => {
                        const isSelected = form.category_id === c.id;
                        const isActive = activeParent?.id === c.id;
                        const subCount = getSubcategories(c.id).length;

                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-md text-sm transition-all border ${
                              isActive
                                ? "bg-background border-primary shadow-xs font-semibold text-primary"
                                : isSelected
                                ? "bg-primary/10 border-primary/30 text-foreground font-medium"
                                : "bg-background/80 hover:bg-background border-border/60 text-foreground hover:border-border"
                            }`}
                            onClick={() => {
                              setActiveParentId(c.id);
                              if (subCount === 0) {
                                setForm({ ...form, category_id: c.id });
                              }
                            }}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Folder className="size-4 shrink-0 text-primary/70" />
                              <span className="truncate">{c.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {subCount > 0 ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                  {subCount} subs
                                </Badge>
                              ) : isSelected ? (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                                  Selected
                                </Badge>
                              ) : null}
                              <ChevronRight
                                className={`size-3.5 transition-transform ${
                                  isActive ? "text-primary" : "text-muted-foreground"
                                }`}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Panel 2: Subcategories */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        2. Subcategory
                      </Label>
                      {activeParent && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                          for {activeParent.name}
                        </span>
                      )}
                    </div>
                    <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
                      {!activeParent ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground border border-dashed rounded-md bg-background/50 h-[240px]">
                          <FolderTree className="size-8 text-muted-foreground/40 mb-2" />
                          <p>Select a main category on the left to view subcategories</p>
                        </div>
                      ) : activeSubcategories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-6 text-center text-xs border rounded-md bg-background h-[240px] space-y-2.5">
                          <CheckCircle2 className="size-7 text-emerald-500" />
                          <div>
                            <p className="font-semibold text-sm text-foreground">"{activeParent.name}"</p>
                            <p className="text-muted-foreground mt-0.5">This category has no subcategories.</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={form.category_id === activeParent.id ? "default" : "outline"}
                            onClick={() => setForm({ ...form, category_id: activeParent.id })}
                          >
                            {form.category_id === activeParent.id
                              ? "✓ Selected as Category"
                              : `Select "${activeParent.name}"`}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {/* Option to select top-level main category directly */}
                          <button
                            type="button"
                            className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-md text-sm border transition-all ${
                              form.category_id === activeParent.id
                                ? "bg-primary text-primary-foreground border-primary font-medium"
                                : "bg-background hover:bg-muted/70 border-dashed border-border text-foreground"
                            }`}
                            onClick={() => setForm({ ...form, category_id: activeParent.id })}
                          >
                            <div className="flex items-center gap-2">
                              <Layers className="size-4 shrink-0" />
                              <span>Use <strong>{activeParent.name}</strong> (top-level)</span>
                            </div>
                            {form.category_id === activeParent.id && (
                              <CheckCircle2 className="size-4" />
                            )}
                          </button>

                          <Separator className="my-1.5" />

                          {/* Subcategory list */}
                          {activeSubcategories.map((sub) => {
                            const isSelected = form.category_id === sub.id;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-md text-sm border transition-all ${
                                  isSelected
                                    ? "bg-primary/10 border-primary text-primary font-medium"
                                    : "bg-background hover:bg-muted border-border/60 text-foreground hover:border-border"
                                }`}
                                onClick={() => setForm({ ...form, category_id: sub.id })}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="text-muted-foreground">↳</span>
                                  <span className="truncate">{sub.name}</span>
                                </div>
                                {isSelected && (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                                    Selected
                                  </Badge>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Selected Category Confirmation Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-accent/40 p-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-primary" />
                    Selected Category:
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {form.category_id ? (
                      getCategoryPath(form.category_id)
                    ) : (
                      <span className="text-muted-foreground font-normal italic">
                        Please choose a category or subcategory above
                      </span>
                    )}
                  </p>
                </div>

                <Button
                  type="button"
                  disabled={!form.category_id}
                  onClick={() => setStep("info")}
                  className="gap-1.5"
                >
                  Continue to Details
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* Additional Category Mapping Link Notice */}
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                <ExternalLink className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold text-foreground">Multiple Category Mapping:</span>{" "}
                  Select the primary category for this product above. Additional categories can be
                  assigned anytime via the{" "}
                  <Link
                    to="/category-mapping"
                    className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-0.5"
                  >
                    Category Mapping tool
                    <ExternalLink className="size-3" />
                  </Link>
                  .
                </div>
              </div>
            </TabsContent>


            <TabsContent value="info" className="grid gap-3 pt-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Folder className="size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">Category:</span>
                  <span className="font-semibold text-foreground truncate">
                    {form.category_id ? getCategoryPath(form.category_id) : "None selected"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-primary hover:text-primary/80 px-2"
                  onClick={() => setStep("category")}
                >
                  Change
                </Button>
              </div>

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
              <F label="Subcategory (optional)">
                <Input
                  placeholder="e.g. Antibiotics, Daily Staples, Casual Wear"
                  value={form.subcategory}
                  onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                />
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
              {form.id ? (
                <div className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/40 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold">Opening / Starting Stock</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Current: <span className="font-medium text-foreground">{form.opening_stock} {form.unit}</span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOpeningStockProduct({
                          id: form.id,
                          name: form.name,
                          sku: form.sku,
                          unit: form.unit,
                          purchase_price: Number(form.purchase_price || 0),
                          opening_stock: Number(form.opening_stock || 0),
                        });
                      }}
                    >
                      <Boxes className="mr-1.5 size-4 text-primary" /> Update Opening Stock
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    You can update product-level or godown/location-wise opening stock anytime.
                  </p>
                </div>
              ) : (
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
            </TabsContent>

            <TabsContent value="business" className="space-y-4 pt-4">
              <BusinessSpecificFields
                businessType={activeBusiness?.business_type}
                activeFormulation={form.active_formulation}
                onActiveFormulationChange={(v) => setForm({ ...form, active_formulation: v })}
                data={form.business_type_data || {}}
                onChange={(data) => setForm({ ...form, business_type_data: data })}
              />

              <div className="flex items-center justify-between border-t pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setStep("info")}>
                  Back to Info
                </Button>
                <Button type="button" size="sm" onClick={() => setStep("pricing")}>
                  Continue to Pricing
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="batches" className="pt-4">
              {form.id ? (
                <ProductBatchManager
                  productId={form.id}
                  productName={form.name}
                  defaultPurchasePrice={Number(form.purchase_price || 0)}
                  defaultMrp={Number(form.mrp || 0)}
                  defaultSellingPrice={Number(form.selling_price || 0)}
                  defaultGstRate={Number(form.gst_rate || 0)}
                />
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg">
                  Please save the product first before adding individual batches.
                </div>
              )}
            </TabsContent>

            <TabsContent value="variants" className="pt-4">
              {form.id ? (
                <ProductVariantManager
                  productId={form.id}
                  productName={form.name}
                  defaultSku={form.sku}
                  defaultPurchasePrice={Number(form.purchase_price || 0)}
                  defaultMrp={Number(form.mrp || 0)}
                  defaultSellingPrice={Number(form.selling_price || 0)}
                />
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg">
                  Please save the product first before creating variants.
                </div>
              )}
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
      <OpeningStockDialog
        product={openingStockProduct}
        open={!!openingStockProduct}
        onOpenChange={(o) => !o && setOpeningStockProduct(null)}
        onSuccess={() => {
          if (openingStockProduct && form.id === openingStockProduct.id) {
            void qc.invalidateQueries({ queryKey: ["products"] });
          }
        }}
      />

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
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} (SKU {deleteTarget?.sku}) will be removed permanently along with
              its category mappings. Products already used in sales, purchases or stock records
              cannot be deleted — mark them Inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) remove.mutate(deleteTarget);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
