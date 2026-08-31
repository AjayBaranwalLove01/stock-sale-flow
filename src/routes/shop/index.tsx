import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store } from "lucide-react";
import type { StoreBusiness } from "@/lib/storefront";

export const Route = createFileRoute("/shop/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Browse stores — Stock Keeper Platform" },
      { name: "description", content: "Pick a store to browse its products and place an order online." },
      { property: "og:title", content: "Browse stores — Stock Keeper Platform" },
      {
        property: "og:description",
        content: "Pick a store to browse its products and place an order online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoreDirectory,
});

function StoreDirectory() {
  const { data, isLoading } = useQuery({
    queryKey: ["storefronts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("storefront_businesses").select("*").order("name");
      if (error) throw error;
      return data as unknown as StoreBusiness[];
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Browse stores</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Each business has its own online store. On a live domain these are reachable at
        <span className="font-medium"> store.yourdomain.com</span>.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading stores…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No storefronts are live right now.</p>
        ) : (
          (data ?? []).map((b) => (
            <Card key={b.id} className="flex items-center gap-3 p-4">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Store className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[b.city, b.state].filter(Boolean).join(", ") || b.subdomain}
                </p>
              </div>
              <Button asChild size="sm">
                <Link to="/shop/$code" params={{ code: b.subdomain }}>
                  Visit
                </Link>
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
