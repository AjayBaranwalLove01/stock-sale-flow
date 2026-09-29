import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/queries";

export interface OpeningStockItem {
  id?: string;
  warehouseId: string | null;
  warehouseName?: string;
  warehouseCode?: string;
  quantity: number;
}

export interface ProductOpeningStockData {
  productId: string;
  productName: string;
  productSku: string;
  purchasePrice: number;
  totalOpeningStock: number;
  hasLocationBreakdown: boolean;
  entries: OpeningStockItem[];
}

/**
 * Fetch current opening stock records for a product from inventory_transactions
 */
export async function getProductOpeningStock(
  productId: string,
): Promise<{
  total: number;
  records: Array<{
    id: string;
    warehouse_id: string | null;
    qty_in: number;
    notes: string | null;
    reference_no: string | null;
    txn_date: string;
  }>;
}> {
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("id, warehouse_id, qty_in, notes, reference_no, txn_date")
    .eq("product_id", productId)
    .eq("txn_type", "opening");

  if (error) throw error;
  const records = data ?? [];
  const total = records.reduce((s, r) => s + Number(r.qty_in || 0), 0);
  return { total, records };
}

export interface SaveOpeningStockParams {
  productId: string;
  productName: string;
  productSku: string;
  purchasePrice: number;
  isLocationWise: boolean;
  locationQuantities?: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    quantity: number;
  }>;
  productLevelQuantity?: number;
  remarks?: string;
}

/**
 * Add or update opening stock for a product, replacing/correcting previous opening stock
 * without creating fake purchases or duplicate transactions.
 */
export async function saveProductOpeningStock({
  productId,
  productName,
  productSku,
  purchasePrice,
  isLocationWise,
  locationQuantities = [],
  productLevelQuantity = 0,
  remarks = "",
}: SaveOpeningStockParams): Promise<{ total: number }> {
  // 1. Fetch current opening records to calculate previous state and audit diff
  const { records: existingRecords, total: previousTotal } =
    await getProductOpeningStock(productId);

  const today = new Date().toISOString().slice(0, 10);
  const noteText = remarks.trim()
    ? `Opening Stock: ${remarks.trim()}`
    : "Opening stock balance";

  let newTotal = 0;

  if (isLocationWise && locationQuantities.length > 0) {
    newTotal = locationQuantities.reduce((s, l) => s + Math.max(0, Number(l.quantity || 0)), 0);

    // Remove any previous non-location opening record (product-level)
    const nonLocationRecords = existingRecords.filter((r) => !r.warehouse_id);
    for (const r of nonLocationRecords) {
      await supabase.from("inventory_transactions").delete().eq("id", r.id);
    }

    // Process each warehouse
    for (const loc of locationQuantities) {
      const targetQty = Math.max(0, Number(loc.quantity || 0));
      const existing = existingRecords.find((r) => r.warehouse_id === loc.warehouseId);

      if (existing) {
        if (targetQty > 0) {
          // Update existing opening record in place
          const { error } = await supabase
            .from("inventory_transactions")
            .update({
              qty_in: targetQty,
              qty_out: 0,
              unit_cost: purchasePrice || 0,
              notes: noteText,
              txn_date: today,
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          // Set to 0 or delete so stock correctly reflects 0
          const { error } = await supabase
            .from("inventory_transactions")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else if (targetQty > 0) {
        // Insert new opening record for this warehouse
        const refNo = `OP-${productSku}-${loc.warehouseCode || loc.warehouseId.slice(0, 4)}`.toUpperCase();
        const { error } = await supabase.from("inventory_transactions").insert({
          product_id: productId,
          warehouse_id: loc.warehouseId,
          txn_type: "opening",
          reference_type: "opening",
          reference_no: refNo,
          qty_in: targetQty,
          qty_out: 0,
          unit_cost: purchasePrice || 0,
          notes: noteText,
          txn_date: today,
        });
        if (error) throw error;
      }
    }
  } else {
    // Product-level opening quantity (no warehouse or global)
    newTotal = Math.max(0, Number(productLevelQuantity || 0));

    // Remove any previous location-wise opening records
    const locationWiseRecords = existingRecords.filter((r) => !!r.warehouse_id);
    for (const r of locationWiseRecords) {
      await supabase.from("inventory_transactions").delete().eq("id", r.id);
    }

    const existingGlobal = existingRecords.find((r) => !r.warehouse_id);
    if (existingGlobal) {
      if (newTotal > 0) {
        const { error } = await supabase
          .from("inventory_transactions")
          .update({
            qty_in: newTotal,
            qty_out: 0,
            unit_cost: purchasePrice || 0,
            notes: noteText,
            txn_date: today,
          })
          .eq("id", existingGlobal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("inventory_transactions")
          .delete()
          .eq("id", existingGlobal.id);
        if (error) throw error;
      }
    } else if (newTotal > 0) {
      const refNo = `OP-${productSku}`.toUpperCase();
      const { error } = await supabase.from("inventory_transactions").insert({
        product_id: productId,
        warehouse_id: null,
        txn_type: "opening",
        reference_type: "opening",
        reference_no: refNo,
        qty_in: newTotal,
        qty_out: 0,
        unit_cost: purchasePrice || 0,
        notes: noteText,
        txn_date: today,
      });
      if (error) throw error;
    }
  }

  // 2. Update products.opening_stock to mirror the new total
  const { error: pErr } = await supabase
    .from("products")
    .update({ opening_stock: newTotal })
    .eq("id", productId);
  if (pErr) throw pErr;

  // 3. Complete audit log with previous vs new values
  await logAudit(
    "Inventory",
    "Opening Stock Updated",
    productId,
    {
      previous_opening_stock: previousTotal,
      previous_breakdown: existingRecords.map((r) => ({
        id: r.id,
        warehouse_id: r.warehouse_id,
        qty: r.qty_in,
      })),
    },
    {
      new_opening_stock: newTotal,
      is_location_wise: isLocationWise,
      location_quantities: isLocationWise ? locationQuantities : null,
      product_level_quantity: !isLocationWise ? productLevelQuantity : null,
      remarks: remarks || null,
      product_name: productName,
      product_sku: productSku,
      updated_at: new Date().toISOString(),
    },
  );

  return { total: newTotal };
}
