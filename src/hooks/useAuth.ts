import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useEffect } from "react";
import { bootstrapAccount } from "@/lib/tenant.functions";


export type AppRole =
  | "super_admin"
  | "admin"
  | "billing_user"
  | "inventory_user"
  | "credit_officer";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Business Admin",
  billing_user: "Billing User",
  inventory_user: "Inventory User",
  credit_officer: "Credit Collection Officer",
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
  | "orders"
  | "promotions"
  | "inventory"
  | "warehouses"
  | "transfers"
  | "stock-entry"
  | "payments"
  | "returns"
  | "reports"
  | "users"
  | "settings"
  | "audit"
  | "signage"
  | "credit"
  | "collections"
  | "businesses"
  | "features";

const ALL: ModuleKey[] = [
  "dashboard",
  "categories",
  "products",
  "customers",
  "suppliers",
  "purchases",
  "sales",
  "orders",
  "promotions",
  "inventory",
  "warehouses",
  "transfers",
  "stock-entry",
  "payments",
  "returns",
  "reports",
  "users",
  "settings",
  "audit",
  "signage",
  "credit",
  "collections",
  "businesses",
  "features",
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
    "orders",
    "promotions",
    "inventory",
    "warehouses",
    "transfers",
    "stock-entry",
    "payments",
    "returns",
    "reports",
    "users",
    "settings",
    "audit",
    "signage",
    "credit",
    "collections",
  ],
  billing_user: [
    "dashboard",
    "customers",
    "sales",
    "orders",
    "payments",
    "returns",
    "credit",
    "collections",
  ],
  inventory_user: [
    "dashboard",
    "categories",
    "products",
    "suppliers",
    "purchases",
    "inventory",
    "warehouses",
    "transfers",
    "stock-entry",
  ],
  credit_officer: ["dashboard", "collections"],
};

export interface AuthState {
  user: User | null;
  roles: AppRole[];
  status: "active" | "inactive" | null;
  businessId: string | null;
  accountType: "staff" | "customer" | null;
  isSuperAdmin: boolean;
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
      if (!user)
        return {
          user: null,
          roles: [] as AppRole[],
          status: null,
          businessId: null,
          accountType: null,
        };
      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("status, business_id, account_type")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (!profile) {
        // First sign-in: create the profile (and Super Admin role for the very first staff user).
        await bootstrapAccount();
        const [{ data: roles2 }, { data: profile2 }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase
            .from("profiles")
            .select("status, business_id, account_type")
            .eq("id", user.id)
            .maybeSingle(),
        ]);
        return {
          user,
          roles: (roles2 ?? []).map((r) => r.role as AppRole),
          status: (profile2?.status ?? null) as "active" | "inactive" | null,
          businessId: (profile2?.business_id ?? null) as string | null,
          accountType: (profile2?.account_type ?? null) as "staff" | "customer" | null,
        };
      }

      return {
        user,
        roles: (roleRows ?? []).map((r) => r.role as AppRole),
        status: (profile?.status ?? null) as "active" | "inactive" | null,
        businessId: (profile?.business_id ?? null) as string | null,
        accountType: (profile?.account_type ?? null) as "staff" | "customer" | null,
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
    businessId: data?.businessId ?? null,
    accountType: data?.accountType ?? null,
    isSuperAdmin: roles.includes("super_admin"),
    loading: isLoading,
    allowed,
    can: (m) => allowed.includes(m),
  };
}
