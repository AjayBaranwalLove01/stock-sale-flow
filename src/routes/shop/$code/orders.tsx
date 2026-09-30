import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PackageSearch } from "lucide-react";
import { inr, dateTimeFmt } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useStoreBusiness } from "@/lib/storefront";
import { StoreImage } from "@/components/StoreImage";

export const Route = createFileRoute("/shop/$code/orders")({
  head: () => ({
    meta: [
      { title: "My orders — Stock Keeper Storefront" },
      { name: "description", content: "Track the orders you placed with this store." },
      { property: "og:title", content: "My orders — Stock Keeper Storefront" },
      { property: "og:description", content: "Track the orders you placed with this store." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyOrders,
});

type Row = {
  id: string;
  order_no: string;
  status: string;
  grand_total: number;
  created_at: string;
  order_items: {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    total: number;
  }[];
};

function MyOrders() {
  const { code } = useParams({ from: "/shop/$code" });
  const { user, loading } = useAuth();
  const { data: business } = useStoreBusiness(code);

  const { data, isLoading } = useQuery({
    queryKey: ["my-orders", business?.id, user?.id],
    enabled: !!user && !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_no, status, grand_total, created_at, order_items(id, product_id, product_name, quantity, total)",
        )
        .eq("business_id", business!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data as unknown as Row[];
      const productIds = [
        ...new Set(rows.flatMap((o) => o.order_items.map((i) => i.product_id))),
      ];
      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from("storefront_products")
          .select("id, image_sm, image_md")
          .in("id", productIds);
        const imgById = new Map<string, string | null>(
          (prods ?? [])
            .filter((p: { id: string | null }) => p.id != null)
            .map((p: { id: string | null; image_sm: string | null; image_md: string | null }) => [
              p.id as string,
              p.image_sm ?? p.image_md,
            ]),
        );
        for (const o of rows)
          for (const i of o.order_items)
            (i as { image?: string | null }).image = imgById.get(i.product_id) ?? null;
      }
      return rows;
    },
  });

  if (loading) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <PackageSearch className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Sign in at checkout to see your orders.</p>
        <Button asChild>
          <Link to="/shop/$code/checkout" params={{ code }}>
            Go to checkout
          </Link>
        </Button>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading orders…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">You have no orders yet.</p>
      ) : (
        rows.map((o) => (
          <Card key={o.id} className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{o.order_no}</p>
                <p className="text-xs text-muted-foreground">{dateTimeFmt(o.created_at)}</p>
              </div>
              <Badge variant={o.status === "cancelled" ? "destructive" : "secondary"}>{o.status}</Badge>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {o.order_items.map((i) => (
                <div key={i.id} className="flex items-center gap-3">
                  <span className="size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                    <StoreImage
                      path={(i as { image?: string | null }).image}
                      alt={i.product_name}
                      iconClass="size-4"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {i.product_name} × {i.quantity}
                  </span>
                  <span className="tabular">{inr(i.total)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular">{inr(o.grand_total)}</span>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
