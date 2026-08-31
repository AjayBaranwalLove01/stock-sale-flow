import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useEffect } from "react";

export type AppRole = "super_admin" | "admin" | "billing_user" | "inventory_user";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  billing_user: "Billing User",
  inventory_user: "Inventory User",
};

/** Module keys used by the sidebar and route guards. */
export type ModuleKey =
  | "dashboard"
  | "categories"
  | "products"
  | "customers"
  | "suppliers"
  | "purchases"
  | "sales"
  | "inventory"
  | "payments"
  | "returns"
  | "reports"
  | "users"
  | "settings"
  | "audit";

const ALL: ModuleKey[] = [
  "dashboard",
  "categories",
  "products",
  "customers",
  "suppliers",
  "purchases",
  "sales",
  "inventory",
  "payments",
  "returns",
  "reports",
  "users",
  "settings",
  "audit",
];

export const ROLE_MODULES: Record<AppRole, ModuleKey[]> = {
  super_admin: ALL,
  admin: [
    "dashboard",
    "categories",
    "products",
    "customers",
    "suppliers",
    "purchases",
    "sales",
    "inventory",
    "payments",
    "returns",
    "reports",
  ],
  billing_user: ["dashboard", "customers", "sales", "payments", "returns"],
  inventory_user: ["dashboard", "categories", "products", "suppliers", "purchases", "inventory"],
};

export interface AuthState {
  user: User | null;
  roles: AppRole[];
  status: "active" | "inactive" | null;
  loading: boolean;
  can: (m: ModuleKey) => boolean;
  allowed: ModuleKey[];
}

export function useAuth(): AuthState {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user ?? null;
      if (!user) return { user: null, roles: [] as AppRole[], status: null };
      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("status").eq("id", user.id).maybeSingle(),
      ]);
      return {
        user,
        roles: (roleRows ?? []).map((r) => r.role as AppRole),
        status: (profile?.status ?? null) as "active" | "inactive" | null,
      };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void qc.invalidateQueries({ queryKey: ["auth-session"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const roles = data?.roles ?? [];
  const allowed = Array.from(new Set(roles.flatMap((r) => ROLE_MODULES[r] ?? [])));

  return {
    user: data?.user ?? null,
    roles,
    status: data?.status ?? null,
    loading: isLoading,
    allowed,
    can: (m) => allowed.includes(m),
  };
}
