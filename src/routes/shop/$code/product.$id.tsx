import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { StoreImage } from "@/components/StoreImage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, ImageOff, ShoppingCart } from "lucide-react";
import { inr } from "@/lib/format";
import { useCart, useStoreBusiness, useStoreProducts } from "@/lib/storefront";

export const Route = createFileRoute("/shop/$code/product/$id")({
  head: () => ({
    meta: [
      { title: "Product details — Stock Keeper Storefront" },
      { name: "description", content: "Product price, availability and description." },
      { property: "og:title", content: "Product details — Stock Keeper Storefront" },
      { property: "og:description", content: "Product price, availability and description." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { code, id } = useParams({ from: "/shop/$code/product/$id" });
  const { data: business } = useStoreBusiness(code);
  const { data: products, isLoading } = useStoreProducts(business?.id);
  const cart = useCart(code);
  const product = (products ?? []).find((p) => p.id === id);
  const [gallery, setGallery] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let off = false;
    setActive(0);
    supabase
      .from("catalog_images")
      .select("image_md, image_lg, sort_order")
      .eq("entity_type", "product")
      .eq("entity_id", id)
      .order("sort_order")
      .then(({ data }) => {
        if (!off) setGallery((data ?? []).map((r) => r.image_lg || r.image_md));
      });
    return () => {
      off = true;
    };
  }, [id]);

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (!product) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">This product is no longer available.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/shop/$code" params={{ code }}>
            Back to store
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/shop/$code" params={{ code }}>
          <ArrowLeft className="mr-1.5 size-4" />
          All products
        </Link>
      </Button>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <Card className="flex aspect-square items-center justify-center overflow-hidden bg-muted p-0">
            <StoreImage
              path={gallery[active] ?? product.image_lg ?? product.image_md}
              alt={product.name}
              iconClass="size-10"
            />
          </Card>
          {gallery.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {gallery.map((g, i) => (
                <button
                  key={g + i}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={`size-16 overflow-hidden rounded-md border-2 bg-muted ${i === active ? "border-primary" : "border-transparent"}`}
                >
                  <StoreImage path={g} alt={`${product.name} photo ${i + 1}`} iconClass="size-5" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
            <p className="text-sm text-muted-foreground">
              {product.brand ?? "—"} · Sold per {product.unit}
            </p>
          </div>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-semibold">{inr(product.selling_price)}</p>
            {product.mrp > product.selling_price && (
              <p className="pb-1 text-sm text-muted-foreground line-through">{inr(product.mrp)}</p>
            )}
          </div>
          <Badge variant={product.in_stock ? "secondary" : "outline"}>
            {product.in_stock ? "In stock" : "Out of stock"}
          </Badge>
          {product.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={!product.in_stock}
              onClick={() => {
                cart.add({
                  product_id: product.id,
                  name: product.name,
                  price: Number(product.selling_price),
                  image_md: product.image_md,
                });
                toast.success("Added to cart");
              }}
            >
              <ShoppingCart className="mr-1.5 size-4" />
              Add to cart
            </Button>
            <Button asChild variant="outline">
              <Link to="/shop/$code/cart" params={{ code }}>
                View cart
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
