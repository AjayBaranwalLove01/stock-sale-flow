import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  image_sm: string | null;
  image_md: string | null;
  image_lg: string | null;
  status: "active" | "inactive";

  created_at: string;
};

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(id,name,code,parent_id)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useSales() {
  return useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, customers(name), sale_items(*)")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePurchases() {
  return useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name), purchase_items(*, products(name,sku))")
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInventoryTxns(productId?: string) {
  return useQuery({
    queryKey: ["inventory_txns", productId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("inventory_transactions")
        .select("*, products(name,sku,unit)")
        .order("txn_date", { ascending: false })
        .limit(500);
      if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export async function logAudit(
  module: string,
  action: string,
  recordId?: string,
  oldValue?: unknown,
  newValue?: unknown,
) {
  const { data } = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({
    user_id: data.user?.id ?? null,
    user_email: data.user?.email ?? null,
    module,
    action,
    record_id: recordId ?? null,
    old_value: (oldValue ?? null) as never,
    new_value: (newValue ?? null) as never,
  });
}
