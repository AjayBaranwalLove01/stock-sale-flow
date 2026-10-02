import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/queries";

export interface ProductBatch {
  id: string;
  business_id: string;
  product_id: string;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  purchase_date: string | null;
  supplier_id: string | null;
  purchase_invoice_no: string | null;
  purchase_price: number;
  mrp: number;
  selling_price: number;
  gst_rate: number;
  quantity: number;
  free_quantity: number;
  warehouse_id: string | null;
  status: "active" | "expired" | "quarantined" | "recalled" | "exhausted";
  notes: string | null;
  created_at: string;
  updated_at: string;
  products?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    active_formulation: string | null;
  };
  warehouses?: {
    id: string;
    name: string;
  } | null;
  suppliers?: {
    id: string;
    name: string;
  } | null;
}

export function useProductBatches(productId?: string) {
  return useQuery({
    queryKey: ["product_batches", productId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("product_batches" as any)
        .select("*, products(id, name, sku, unit, active_formulation), warehouses(id, name), suppliers(id, name)")
        .order("expiry_date", { ascending: true, nullsFirst: false });

      if (productId) {
        q = q.eq("product_id", productId);
      }
      const { data, error } = await q;
      if (error) {
        // If table doesn't exist yet or other error, return empty array gracefully
        console.warn("Product batches query error:", error.message);
        return [] as ProductBatch[];
      }
      return (data ?? []) as unknown as ProductBatch[];
    },
  });
}

export function useAllBatches() {
  return useQuery({
    queryKey: ["product_batches", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches" as any)
        .select("*, products(id, name, sku, unit, active_formulation), warehouses(id, name), suppliers(id, name)")
        .order("expiry_date", { ascending: true, nullsFirst: false });

      if (error) {
        console.warn("Product batches query error:", error.message);
        return [] as ProductBatch[];
      }
      return (data ?? []) as unknown as ProductBatch[];
    },
  });
}

export function getExpiryCategory(expiryDateStr: string | null): "expired" | "d30" | "d60" | "d90" | "good" {
  if (!expiryDateStr) return "good";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr);
  exp.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "d30";
  if (diffDays <= 60) return "d60";
  if (diffDays <= 90) return "d90";
  return "good";
}

export function getDaysUntilExpiry(expiryDateStr: string | null): number | null {
  if (!expiryDateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function useSaveBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batch: Partial<ProductBatch> & { product_id: string; batch_number: string }) => {
      const isEdit = !!batch.id;
      const payload: any = {
        product_id: batch.product_id,
        batch_number: batch.batch_number.trim(),
        manufacturing_date: batch.manufacturing_date || null,
        expiry_date: batch.expiry_date || null,
        purchase_price: Number(batch.purchase_price || 0),
        mrp: Number(batch.mrp || 0),
        selling_price: Number(batch.selling_price || 0),
        gst_rate: Number(batch.gst_rate || 0),
        warehouse_id: batch.warehouse_id || null,
        supplier_id: batch.supplier_id || null,
        notes: batch.notes || null,
        status: batch.status || "active",
      };

      if (isEdit) {
        const { data, error } = await supabase
          .from("product_batches" as any)
          .update(payload)
          .eq("id", batch.id)
          .select()
          .single();
        if (error) throw error;
        await logAudit("Inventory", "Batch Updated", batch.id, null, payload);
        return data;
      } else {
        payload.quantity = Number(batch.quantity || 0);
        const { data, error } = await supabase
          .from("product_batches" as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        // If initial quantity > 0, record opening stock transaction
        if (payload.quantity > 0) {
          const { error: txnErr } = await supabase.from("inventory_transactions").insert({
            product_id: batch.product_id,
            warehouse_id: batch.warehouse_id || null,
            batch_id: (data as any).id,
            txn_type: "opening",
            reference_type: "opening",
            reference_no: `BATCH-${batch.batch_number}`,
            qty_in: payload.quantity,
            unit_cost: payload.purchase_price,
            notes: `Batch ${batch.batch_number} opening stock`,
          } as any);
          if (txnErr) console.warn("Failed to create opening txn for batch:", txnErr);
        }

        // Also ensure product.has_batches = true
        await supabase
          .from("products")
          .update({ has_batches: true } as any)
          .eq("id", batch.product_id);

        await logAudit("Inventory", "Batch Created", (data as any).id, null, payload);
        return data;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["product_batches"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["warehouse_stock"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
    },
  });
}

export function useAdjustBatchStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      batchId,
      productId,
      currentQty,
      newQty,
      warehouseId,
      reason,
    }: {
      batchId: string;
      productId: string;
      currentQty: number;
      newQty: number;
      warehouseId?: string | null;
      reason: string;
    }) => {
      const diff = newQty - currentQty;
      if (diff === 0) return;

      const isAddition = diff > 0;
      const qtyIn = isAddition ? diff : 0;
      const qtyOut = isAddition ? 0 : Math.abs(diff);

      const { error: txnErr } = await supabase.from("inventory_transactions").insert({
        product_id: productId,
        warehouse_id: warehouseId || null,
        batch_id: batchId,
        txn_type: "adjustment",
        reference_type: "adjustment",
        reference_no: `ADJ-BATCH-${Date.now().toString().slice(-6)}`,
        qty_in: qtyIn,
        qty_out: qtyOut,
        previous_stock: currentQty,
        new_stock: newQty,
        notes: `Batch Adjustment: ${reason}`,
      } as any);

      if (txnErr) throw txnErr;

      await logAudit("Inventory", "Batch Stock Adjusted", batchId, { currentQty }, { newQty, reason });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["product_batches"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["warehouse_stock"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
    },
  });
}
