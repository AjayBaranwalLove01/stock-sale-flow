import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { ShoppingCart, Store, PackageSearch, LogIn, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart, useStoreBusiness } from "@/lib/storefront";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/shop/$code")({
  ssr: false,
  component: StoreLayout,
});

function StoreLayout() {
  const { code } = useParams({ from: "/shop/$code" });
  const { data: business, isLoading } = useStoreBusiness(code);
  const { count } = useCart(code);
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading store…
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <PackageSearch className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">This store isn&apos;t available</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The shop you are looking for is closed, does not exist, or its online store has been
          switched off.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/shop/$code" params={{ code }} className="flex items-center gap-2">
            {business.logo_url ? (
              <img src={business.logo_url} alt={business.name} className="size-8 rounded-md object-cover" />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Store className="size-4" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{business.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {[business.city, business.state].filter(Boolean).join(", ")}
              </span>
            </span>
          </Link>
          <div className="flex-1" />
          <Button asChild variant="ghost" size="sm">
            <Link to="/shop/$code/orders" params={{ code }}>
              <UserRound className="mr-1.5 size-4" />
              {user ? "My orders" : "Sign in"}
              {!user && <LogIn className="ml-1.5 size-3.5" />}
            </Link>
          </Button>
          <Button asChild size="sm" className="relative gap-1.5">
            <Link to="/shop/$code/cart" params={{ code }}>
              <ShoppingCart className="size-4" />
              Cart
              {count > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                  {count}
                </Badge>
              )}
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        {business.name} · {business.phone ?? ""} {business.email ?? ""}
      </footer>
    </div>
  );
}
