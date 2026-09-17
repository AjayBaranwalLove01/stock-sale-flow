import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, LoadingRows, EmptyState } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, X, FolderTree, GripVertical, Loader2 } from "lucide-react";
import {
  useCategories,
  useProducts,
  useProductCategoryLinks,
  useMapProducts,
  useUnmapProduct,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/category-mapping")({
  head: () => ({
    meta: [
      { title: "Category Mapping — Ledger ERP" },
      {
        name: "description",
        content: "Drag products onto categories to map one product to many categories.",
      },
      { property: "og:title", content: "Category Mapping — Ledger ERP" },
      {
        property: "og:description",
        content: "Drag products onto categories to map one product to many categories.",
      },
    ],
  }),
  component: CategoryMappingPage,
});

/** Delay a value so search filtering does not run on every keystroke. */
function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const PAGE_SIZE = 40;

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  business_id: string;
  status: string;
};

function CategoryMappingPage() {
  const { data: categories, isLoading: catsLoading } = useCategories();
  const { data: products, isLoading: prodLoading } = useProducts();
  const { data: links, isLoading: linksLoading } = useProductCategoryLinks();
  const mapProducts = useMapProducts();
  const unmap = useUnmapProduct();

  const [catSearch, setCatSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const debouncedCat = useDebounced(catSearch);
  const debouncedProd = useDebounced(prodSearch);

  const catName = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );

  /** category id -> product ids, and product id -> category ids */
  const { byCategory, byProduct } = useMemo(() => {
    const byCategory = new Map<string, Set<string>>();
    const byProduct = new Map<string, string[]>();
    for (const l of links ?? []) {
      if (!byCategory.has(l.category_id)) byCategory.set(l.category_id, new Set());
      byCategory.get(l.category_id)!.add(l.product_id);
      byProduct.set(l.product_id, [...(byProduct.get(l.product_id) ?? []), l.category_id]);
    }
    return { byCategory, byProduct };
  }, [links]);

  /** Category tree flattened depth-first, max 4 levels. */
  const tree = useMemo(() => {
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

  const visibleCats = useMemo(() => {
    const s = debouncedCat.toLowerCase();
    return s ? tree.filter((c) => c.name.toLowerCase().includes(s)) : tree;
  }, [tree, debouncedCat]);

  const allProducts = useMemo(
    () =>
      ((products ?? []) as unknown as ProductRow[]).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        business_id: p.business_id,
        status: p.status,
      })),
    [products],
  );

  const filtered = useMemo(() => {
    const s = debouncedProd.toLowerCase();
    return allProducts.filter((p) => {
      const cats = byProduct.get(p.id) ?? [];
      const matches =
        !s || p.name.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s);
      const passes =
        filter === "all"
          ? true
          : filter === "mapped"
            ? cats.length > 0
            : filter === "unmapped"
              ? cats.length === 0
              : cats.includes(filter);
      return matches && passes;
    });
  }, [allProducts, byProduct, debouncedProd, filter]);

  useEffect(() => setVisible(PAGE_SIZE), [debouncedProd, filter]);

  const page = filtered.slice(0, visible);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assign(categoryId: string, productIds: string[]) {
    const rows = allProducts.filter((p) => productIds.includes(p.id));
    if (!rows.length) return;
    const name = catName.get(categoryId) ?? "category";
    try {
      const res = await mapProducts.mutateAsync({
        categoryId,
        products: rows,
        categoryName: name,
      });
      if (res.added === 0) {
        toast.info(
          rows.length === 1
            ? "Product is already mapped to this category."
            : "All selected products are already mapped to this category.",
        );
      } else {
        toast.success(
          `${res.added} ${res.added === 1 ? "product" : "products"} mapped to ${name}` +
            (res.skipped ? ` · ${res.skipped} already mapped` : ""),
        );
      }
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not map products");
    }
  }

  async function remove(productId: string, categoryId: string) {
    try {
      await unmap.mutateAsync({
        productId,
        categoryId,
        productName: allProducts.find((p) => p.id === productId)?.name ?? "",
        categoryName: catName.get(categoryId) ?? "",
      });
      toast.success("Mapping removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove mapping");
    }
  }

  const busy = mapProducts.isPending || unmap.isPending;
  const loading = catsLoading || prodLoading || linksLoading;

  return (
    <div>
      <PageHeader
        title="Category Mapping"
        description="Drag products onto a category. One product can belong to many categories — the product itself is never duplicated."
        actions={
          busy ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Saving…
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <Card className="overflow-hidden py-0 shadow-none">
          <LoadingRows />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,380px)_1fr]">
          {/* Categories */}
          <Card className="flex flex-col gap-0 overflow-hidden py-0 shadow-none">
            <div className="space-y-2 border-b p-3">
              <div className="relative">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search categories…"
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                />
              </div>
              {selected.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selected.size} selected — drag onto a category, or press “Assign”.
                </p>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {visibleCats.length === 0 ? (
                <EmptyState title="No categories" description="Create a category first." />
              ) : (
                visibleCats.map((c) => {
                  const count = byCategory.get(c.id)?.size ?? 0;
                  const active = dragOver === c.id;
                  return (
                    <div
                      key={c.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(c.id);
                      }}
                      onDragLeave={() => setDragOver((d) => (d === c.id ? null : d))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const raw = e.dataTransfer.getData("text/plain");
                        const ids = raw ? (JSON.parse(raw) as string[]) : [];
                        void assign(c.id, ids);
                      }}
                      style={{ marginLeft: c.depth * 14 }}
                      className={`mb-1 flex items-center justify-between gap-2 rounded-md border p-2 transition-colors ${
                        active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderTree className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm">{c.name}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.size === 0 || busy}
                        onClick={() => void assign(c.id, [...selected])}
                      >
                        Assign
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Products */}
          <Card className="flex flex-col gap-0 overflow-hidden py-0 shadow-none">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search products by name or SKU…"
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  <SelectItem value="mapped">Mapped products</SelectItem>
                  <SelectItem value="unmapped">Unmapped products</SelectItem>
                  {tree.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span style={{ paddingLeft: c.depth * 12 }}>In: {c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline">{filtered.length} shown</Badge>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-2">
              {page.length === 0 ? (
                <EmptyState title="No products match" description="Adjust your search or filter." />
              ) : (
                page.map((p) => {
                  const cats = byProduct.get(p.id) ?? [];
                  const isSelected = selected.has(p.id);
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        const ids = isSelected && selected.size > 0 ? [...selected] : [p.id];
                        e.dataTransfer.setData("text/plain", JSON.stringify(ids));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className={`mb-1 flex cursor-grab items-start gap-2 rounded-md border p-2 active:cursor-grabbing ${
                        isSelected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(p.id)}
                        className="mt-1"
                      />
                      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                          {p.status !== "active" && <Badge variant="outline">inactive</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {cats.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No categories</span>
                          ) : (
                            cats.map((cid) => (
                              <Badge key={cid} variant="secondary" className="gap-1">
                                {catName.get(cid) ?? "—"}
                                <button
                                  type="button"
                                  aria-label={`Remove ${catName.get(cid) ?? ""}`}
                                  disabled={busy}
                                  onClick={() => void remove(p.id, cid)}
                                  className="rounded-full hover:text-destructive"
                                >
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {visible < filtered.length && (
                <div className="p-2 text-center">
                  <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                    Load more ({filtered.length - visible} remaining)
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
