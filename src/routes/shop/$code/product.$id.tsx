import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
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
        <Card className="flex aspect-square items-center justify-center overflow-hidden bg-muted p-0">
          <StoreImage
            path={product.image_lg ?? product.image_md}
            alt={product.name}
            iconClass="size-10"
          />
        </Card>

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
