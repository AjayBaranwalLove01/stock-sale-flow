import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEnabledFeatures } from "@/hooks/useTenant";

export const WAREHOUSE_TYPES = ["SHOP", "GODOWN", "WAREHOUSE", "BRANCH"] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  SHOP: "Shop",
  GODOWN: "Godown",
  WAREHOUSE: "Warehouse",
  BRANCH: "Branch",
};

export type Warehouse = {
  id: string;
  business_id: string;
  name: string;
  code: string;
  type: WarehouseType;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
};

export type WarehouseStock = {
  id: string;
  business_id: string;
  warehouse_id: string;
  product_id: string;
  quantity: number;
  reserved_quantity: number;
  minimum_stock: number;
  reorder_quantity: number;
};

/** True when Super Admin has switched Godown / Warehouse management on for this business. */
export function useGodown() {
  const { enabled, loading } = useEnabledFeatures();
  return { godown: enabled("godown_management"), loading };
}

export function useWarehouses(activeOnly = false) {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as unknown as Warehouse[];
    },
    select: (rows) => (activeOnly ? rows.filter((w) => w.is_active) : rows),
  });
}

/** Locations the signed-in user may operate from (all active ones when unrestricted). */
export function useMyWarehouses() {
  const { user } = useAuth();
  const { data: all } = useWarehouses(true);
  const { data: access } = useQuery({
    queryKey: ["user_warehouse_access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_warehouse_access")
        .select("warehouse_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((r) => r.warehouse_id as string);
    },
  });
  const list = all ?? [];
  const mine = access && access.length > 0 ? list.filter((w) => access.includes(w.id)) : list;
  return { warehouses: mine, defaultId: mine.find((w) => w.is_default)?.id ?? mine[0]?.id ?? null };
}

export function useWarehouseStock(warehouseId?: string) {
  return useQuery({
    queryKey: ["warehouse_stock", warehouseId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("warehouse_stock").select("*");
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as WarehouseStock[];
    },
  });
}

export function useSaveWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Warehouse> & { business_id?: string | undefined }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from("warehouses").update(rest as never).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("warehouses")
        .insert(input as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
  });
}

export function useSetDefaultWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (warehouseId: string) => {
      const { error } = await supabase.rpc("set_default_warehouse", { p_warehouse_id: warehouseId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
  });
}

export type TransferLine = { product_id: string; quantity: number };

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      from: string;
      to: string;
      items: TransferLine[];
      remarks?: string;
    }) => {
      const { data, error } = await supabase.rpc("create_stock_transfer", {
        p_from_warehouse_id: input.from,
        p_to_warehouse_id: input.to,
        p_items: input.items as never,
        p_remarks: input.remarks ?? undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stock_transfers"] });
      void qc.invalidateQueries({ queryKey: ["warehouse_stock"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
    },
  });
}

export function useStockTransfers() {
  return useQuery({
    queryKey: ["stock_transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("*, stock_transfer_items(*, products(name,sku,unit))")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}
