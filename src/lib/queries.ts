import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export type ProductCategoryLink = {
  id: string;
  product_id: string;
  category_id: string;
  business_id: string;
};

/** Every product↔category mapping visible to the signed-in user's business. */
export function useProductCategoryLinks() {
  return useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id,product_id,category_id,business_id");
      if (error) throw error;
      return data as ProductCategoryLink[];
    },
  });
}

/** Invalidate everything that depends on product↔category mappings. */
function useMappingInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["product-categories"] });
    void qc.invalidateQueries({ queryKey: ["category-product-counts"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
  };
}

/**
 * Map one or more products to a category. Existing mappings are kept and never
 * duplicated; the number of newly created mappings is returned.
 */
export function useMapProducts() {
  const invalidate = useMappingInvalidation();
  return useMutation({
    mutationFn: async (vars: {
      categoryId: string;
      products: { id: string; name: string; business_id: string }[];
      categoryName?: string;
    }) => {
      const { data: existing, error: readError } = await supabase
        .from("product_categories")
        .select("product_id")
        .eq("category_id", vars.categoryId)
        .in(
          "product_id",
          vars.products.map((p) => p.id),
        );
      if (readError) throw readError;
      const already = new Set((existing ?? []).map((r) => r.product_id));
      const fresh = vars.products.filter((p) => !already.has(p.id));
      if (fresh.length) {
        const { error } = await supabase.from("product_categories").insert(
          fresh.map((p) => ({
            product_id: p.id,
            category_id: vars.categoryId,
            business_id: p.business_id,
          })),
        );
        if (error) throw error;
        for (const p of fresh) {
          await logAudit("Categories", "Product Mapped To Category", p.id, null, {
            product: p.name,
            category_id: vars.categoryId,
            category: vars.categoryName ?? null,
          });
        }
      }
      return { added: fresh.length, skipped: vars.products.length - fresh.length };
    },
    onSuccess: invalidate,
  });
}

/** Remove a single product↔category mapping. */
export function useUnmapProduct() {
  const invalidate = useMappingInvalidation();
  return useMutation({
    mutationFn: async (vars: {
      productId: string;
      categoryId: string;
      productName?: string;
      categoryName?: string;
    }) => {
      const { error } = await supabase
        .from("product_categories")
        .delete()
        .eq("product_id", vars.productId)
        .eq("category_id", vars.categoryId);
      if (error) throw error;
      await logAudit("Categories", "Product Unmapped From Category", vars.productId, null, {
        product: vars.productName ?? null,
        category_id: vars.categoryId,
        category: vars.categoryName ?? null,
      });
    },
    onSuccess: invalidate,
  });
}

/** Replace the full set of extra categories for a product (used by the product form). */
export async function syncProductCategories(
  productId: string,
  businessId: string,
  categoryIds: string[],
) {
  const wanted = new Set(categoryIds);
  const { data, error } = await supabase
    .from("product_categories")
    .select("id,category_id")
    .eq("product_id", productId);
  if (error) throw error;
  const current = new Set((data ?? []).map((r) => r.category_id));

  const toAdd = [...wanted].filter((c) => !current.has(c));
  const toRemove = (data ?? []).filter((r) => !wanted.has(r.category_id)).map((r) => r.id);

  if (toAdd.length) {
    const { error: ie } = await supabase
      .from("product_categories")
      .insert(toAdd.map((c) => ({ product_id: productId, category_id: c, business_id: businessId })));
    if (ie) throw ie;
  }
  if (toRemove.length) {
    const { error: de } = await supabase.from("product_categories").delete().in("id", toRemove);
    if (de) throw de;
  }
  return { added: toAdd.length, removed: toRemove.length };
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
