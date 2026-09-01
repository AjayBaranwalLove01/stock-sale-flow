import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
  Link,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, ROLE_LABELS, type ModuleKey } from "@/hooks/useAuth";
import { BusinessSwitcher } from "@/components/BusinessSwitcher";
import { useActiveBusiness } from "@/hooks/useTenant";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut, User as UserIcon, Zap, ShieldAlert, Building2 } from "lucide-react";

const MODULE_PATHS: ModuleKey[] = [
  "dashboard",
  "categories",
  "products",
  "customers",
  "suppliers",
  "purchases",
  "sales",
  "inventory",
  "stock-entry",
  "payments",
  "returns",
  "reports",
  "users",
  "settings",
  "audit",
  "businesses",
  "features",
  "orders",
  "promotions",
  "signage",
  "credit",
  "collections",
];



export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, roles, status, loading, can, accountType, isSuperAdmin } = useAuth();
  const { data: activeBusiness } = useActiveBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const blocked =
    accountType === "customer"
      ? "This is a shopper account. Use the store website you registered on to view your orders."
      : status === "inactive"
        ? "Your account has been disabled by an administrator."
        : roles.length === 0
          ? "Your account is awaiting access. A Super Admin must assign your roles before you can use the system."
          : null;


  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Access pending</h1>
          <p className="text-sm text-muted-foreground">{blocked}</p>
          <p className="text-xs text-muted-foreground">Signed in as {user?.email}</p>
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="mr-2 size-4" />
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const currentModule = pathname.split("/")[1] as ModuleKey | undefined;
  const moduleDenied = currentModule && MODULE_PATHS.includes(currentModule) && !can(currentModule);
  // Super Admin viewing "All Businesses" has no working context for business data screens.
  const platformModules: ModuleKey[] = ["dashboard", "businesses", "features"];
  const needsBusinessContext =
    isSuperAdmin &&
    !activeBusiness &&
    !!currentModule &&
    MODULE_PATHS.includes(currentModule) &&
    !platformModules.includes(currentModule);


  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <BusinessSwitcher />
            <div className="flex-1" />

            {can("sales") && (
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/sales">
                  <Zap className="size-4" />
                  New Sale
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="size-4" />
                  <span className="hidden max-w-[160px] truncate sm:inline">{user?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="space-y-1">
                  <p className="truncate text-sm">{user?.email}</p>
                  <div className="flex flex-wrap gap-1">
                    {roles.length ? (
                      roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px]">
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        No role assigned
                      </Badge>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="min-w-0 flex-1 p-4 md:p-6">
            {moduleDenied ? (
              <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center">
                <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
                <h2 className="text-lg font-semibold">No access to this module</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your assigned roles don&apos;t include this section. Ask a Super Admin for access.
                </p>
              </div>
            ) : needsBusinessContext ? (
              <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center">
                <Building2 className="mx-auto mb-3 size-8 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Pick a business first</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You are viewing all businesses. Choose one from the switcher at the top to work
                  with its products, customers and transactions.
                </p>
              </div>
            ) : (
              <Outlet />
            )}

          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
