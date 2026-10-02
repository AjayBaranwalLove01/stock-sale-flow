import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/queries";

export interface ProductVariant {
  id: string;
  business_id: string;
  product_id: string;
  variant_name: string;
  sku: string | null;
  barcode: string | null;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  current_stock: number;
  attributes: Record<string, string>;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export function useProductVariants(productId?: string) {
  return useQuery({
    queryKey: ["product_variants", productId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("product_variants" as any)
        .select("*")
        .order("variant_name");

      if (productId) {
        q = q.eq("product_id", productId);
      }
      const { data, error } = await q;
      if (error) {
        console.warn("Product variants query error:", error.message);
        return [] as ProductVariant[];
      }
      return (data ?? []) as unknown as ProductVariant[];
    },
  });
}

export function useSaveVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (variant: Partial<ProductVariant> & { product_id: string; variant_name: string }) => {
      const isEdit = !!variant.id;
      const payload: any = {
        product_id: variant.product_id,
        variant_name: variant.variant_name.trim(),
        sku: variant.sku ? variant.sku.trim() : null,
        barcode: variant.barcode ? variant.barcode.trim() : null,
        purchase_price: Number(variant.purchase_price || 0),
        selling_price: Number(variant.selling_price || 0),
        mrp: Number(variant.mrp || 0),
        attributes: variant.attributes || {},
        status: variant.status || "active",
      };

      if (isEdit) {
        const { data, error } = await supabase
          .from("product_variants" as any)
          .update(payload)
          .eq("id", variant.id)
          .select()
          .single();
        if (error) throw error;
        await logAudit("Products", "Variant Updated", variant.id, null, payload);
        return data;
      } else {
        payload.current_stock = Number(variant.current_stock || 0);
        const { data, error } = await supabase
          .from("product_variants" as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        // Ensure product.has_variants = true
        await supabase
          .from("products")
          .update({ has_variants: true } as any)
          .eq("id", variant.product_id);

        await logAudit("Products", "Variant Created", (data as any).id, null, payload);
        return data;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["product_variants"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await supabase
        .from("product_variants" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      await logAudit("Products", "Variant Deleted", id, null, { productId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["product_variants"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
