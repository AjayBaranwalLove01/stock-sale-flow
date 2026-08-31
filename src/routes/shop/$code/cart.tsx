import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, ShoppingCart } from "lucide-react";
import { inr } from "@/lib/format";
import { useCart } from "@/lib/storefront";

export const Route = createFileRoute("/shop/$code/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — Stock Keeper Storefront" },
      { name: "description", content: "Review the items in your cart before checking out." },
      { property: "og:title", content: "Your cart — Stock Keeper Storefront" },
      { property: "og:description", content: "Review the items in your cart before checking out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { code } = useParams({ from: "/shop/$code" });
  const cart = useCart(code);

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <ShoppingCart className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Your cart is empty.</p>
        <Button asChild>
          <Link to="/shop/$code" params={{ code }}>
            Start shopping
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <Card className="divide-y p-0">
        {cart.lines.map((l) => (
          <div key={l.product_id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">{inr(l.price)} each</p>
            </div>
            <Input
              type="number"
              min={1}
              value={l.quantity}
              onChange={(e) => cart.setQty(l.product_id, Number(e.target.value))}
              className="h-9 w-20"
            />
            <span className="w-24 text-right text-sm font-medium tabular">
              {inr(l.price * l.quantity)}
            </span>
            <Button variant="ghost" size="icon" onClick={() => cart.setQty(l.product_id, 0)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </Card>
      <div className="flex items-center justify-between rounded-md border p-4">
        <span className="text-sm text-muted-foreground">Item total</span>
        <span className="text-lg font-semibold tabular">{inr(cart.total)}</span>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link to="/shop/$code" params={{ code }}>
            Keep shopping
          </Link>
        </Button>
        <Button asChild className="flex-1">
          <Link to="/shop/$code/checkout" params={{ code }}>
            Checkout
          </Link>
        </Button>
      </div>
    </div>
  );
}
