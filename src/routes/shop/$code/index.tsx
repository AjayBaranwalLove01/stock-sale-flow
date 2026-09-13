import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, ShoppingCart, Megaphone, ImageOff } from "lucide-react";
import { inr } from "@/lib/format";
import {
  useCart,
  useStoreBusiness,
  useStoreCategories,
  useStoreProducts,
  useStorePromotions,
} from "@/lib/storefront";

export const Route = createFileRoute("/shop/$code/")({
  head: () => ({
    meta: [
      { title: "Shop online — Stock Keeper Storefront" },
      { name: "description", content: "Browse products, offers and categories and order online." },
      { property: "og:title", content: "Shop online — Stock Keeper Storefront" },
      { property: "og:description", content: "Browse products, offers and categories and order online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoreHome,
});

function StoreHome() {
  const { code } = useParams({ from: "/shop/$code" });
  const { data: business } = useStoreBusiness(code);
  const { data: products, isLoading } = useStoreProducts(business?.id);
  const { data: categories } = useStoreCategories(business?.id);
  const { data: promotions } = useStorePromotions(business?.id);
  const cart = useCart(code);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("name");

  // Category tree flattened depth-first with depth, for the indented filter list.
  const categoryTree = useMemo(() => {
    const cats = categories ?? [];
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      cats
        .filter((c) => c.parent_id === parentId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((c) => {
          out.push({ id: c.id, name: c.name, depth });
          walk(c.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }, [categories]);

  // Selected category plus all its subcategories (any depth).
  const categoryIds = useMemo(() => {
    if (category === "all") return null;
    const ids = new Set([category]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories ?? []) {
        if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [category, categories]);

  const list = useMemo(() => {
    let rows = (products ?? []).filter(
      (p) =>
        (!categoryIds || categoryIds.has(p.category_id)) &&
        [p.name, p.brand, p.sku].some((v) => (v ?? "").toLowerCase().includes(search.toLowerCase())),
    );
    rows = [...rows].sort((a, b) =>
      sort === "price-asc"
        ? a.selling_price - b.selling_price
        : sort === "price-desc"
          ? b.selling_price - a.selling_price
          : a.name.localeCompare(b.name),
    );
    return rows;
  }, [products, categoryIds, search, sort]);

  return (
    <div className="space-y-6">
      {(promotions ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(promotions ?? []).map((p) => (
            <Card key={p.id} className="flex items-center gap-3 bg-secondary p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Megaphone className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.description ??
                    (p.discount_type === "percent"
                      ? `${p.discount_value}% off`
                      : p.discount_type === "flat"
                        ? `${inr(p.discount_value)} off`
                        : "")}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-md border px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="h-10 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryTree.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span style={{ paddingLeft: c.depth * 14 }}>{c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="price-asc">Price: low to high</SelectItem>
            <SelectItem value="price-desc">Price: high to low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading products…</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No products match your search.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((p) => (
            <Card key={p.id} className="flex flex-col overflow-hidden p-0">
              <Link
                to="/shop/$code/product/$id"
                params={{ code, id: p.id }}
                className="block aspect-square bg-muted"
              >
                {p.image_md ? (
                  <img src={p.image_md} alt={p.name} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-8" />
                  </span>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <Link to="/shop/$code/product/$id" params={{ code, id: p.id }}>
                  <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                </Link>
                <p className="text-xs text-muted-foreground">{p.brand ?? p.unit}</p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div>
                    <p className="text-sm font-semibold">{inr(p.selling_price)}</p>
                    {p.mrp > p.selling_price && (
                      <p className="text-xs text-muted-foreground line-through">{inr(p.mrp)}</p>
                    )}
                  </div>
                  {p.in_stock ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        cart.add({ product_id: p.id, name: p.name, price: Number(p.selling_price) });
                        toast.success(`${p.name} added to cart`);
                      }}
                    >
                      <ShoppingCart className="size-4" />
                    </Button>
                  ) : (
                    <Badge variant="outline">Out of stock</Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}
