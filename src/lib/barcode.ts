import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useEnabledFeatures } from "@/hooks/useTenant";
import { logAudit } from "@/lib/queries";

export const BARCODE_FEATURE = "barcode_management";

export const BARCODE_TYPES = [
  { value: "EAN13", label: "EAN-13 (retail)" },
  { value: "EAN8", label: "EAN-8" },
  { value: "UPC", label: "UPC-A" },
  { value: "CODE128", label: "Code 128" },
  { value: "CODE39", label: "Code 39" },
  { value: "QR", label: "QR Code" },
] as const;

export type BarcodeType = (typeof BARCODE_TYPES)[number]["value"];

export type BarcodePermission =
  | "scan_barcode"
  | "manage_product_barcode"
  | "barcode_stock_entry"
  | "barcode_sales"
  | "generate_barcode"
  | "print_barcode";

const PERMISSIONS: Record<AppRole, BarcodePermission[]> = {
  credit_officer: [],
  super_admin: [
    "scan_barcode",
    "manage_product_barcode",
    "barcode_stock_entry",
    "barcode_sales",
    "generate_barcode",
    "print_barcode",
  ],
  admin: [
    "scan_barcode",
    "manage_product_barcode",
    "barcode_stock_entry",
    "barcode_sales",
    "generate_barcode",
    "print_barcode",
  ],
  inventory_user: [
    "scan_barcode",
    "manage_product_barcode",
    "barcode_stock_entry",
    "generate_barcode",
    "print_barcode",
  ],
  billing_user: ["scan_barcode", "barcode_sales"],
};

/** Feature flag (global + per business) combined with the user's role permissions. */
export function useBarcode() {
  const { roles } = useAuth();
  const { enabled } = useEnabledFeatures();
  const featureOn = enabled(BARCODE_FEATURE);

  return useMemo(() => {
    const granted = new Set(roles.flatMap((r) => PERMISSIONS[r] ?? []));
    return {
      enabled: featureOn,
      can: (p: BarcodePermission) => featureOn && granted.has(p),
    };
  }, [roles, featureOn]);
}

export type BarcodeProduct = {
  id: string;
  sku: string;
  name: string;
  barcode: string;
  barcode_type: string | null;
  selling_price: number;
  purchase_price: number;
  mrp: number;
  gst_rate: number;
  tax_inclusive: boolean;
  current_stock: number;
  unit: string;
  status: "active" | "inactive";
  category_id: string;
};

/** Tenant-scoped, feature-gated barcode lookup. Returns null when nothing matches. */
export async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
  const value = normaliseBarcode(code);
  if (!value) throw new Error("Invalid barcode");
  const { data, error } = await supabase.rpc("lookup_product_by_barcode", { p_barcode: value });
  if (error) throw new Error(friendlyError(error.message));
  const row = (data as BarcodeProduct[] | null)?.[0];
  return row ?? null;
}

export async function generateBarcode(productId?: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_internal_barcode", {
    p_product_id: (productId ?? null) as unknown as string,
  });
  if (error) throw new Error(friendlyError(error.message));
  return data as string;
}

export type StockEntryItem = {
  product_id: string;
  quantity: number;
  purchase_price?: number | null;
  selling_price?: number | null;
};

export async function receiveStockByBarcode(items: StockEntryItem[], notes?: string) {
  const { data, error } = await supabase.rpc("receive_stock_by_barcode", {
    p_items: items as never,
    p_notes: notes ?? "",
  });
  if (error) throw new Error(friendlyError(error.message));
  return data as number;
}

export function normaliseBarcode(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, "");
}

/** Best-effort format guess so labels render with a valid symbology. */
export function guessBarcodeType(value: string): BarcodeType {
  const v = normaliseBarcode(value);
  if (/^\d{13}$/.test(v)) return "EAN13";
  if (/^\d{12}$/.test(v)) return "UPC";
  if (/^\d{8}$/.test(v)) return "EAN8";
  if (/^[0-9A-Z\-. $/+%]+$/.test(v)) return "CODE39";
  return "CODE128";
}

export function validateBarcode(value: string, type?: string | null): string | null {
  const v = normaliseBarcode(value);
  if (!v) return "Enter or scan a barcode";
  if (v.length < 4) return "Barcode looks too short";
  const t = type && type !== "" ? type : guessBarcodeType(v);
  if (t === "EAN13" && !/^\d{13}$/.test(v)) return "EAN-13 must be exactly 13 digits";
  if (t === "EAN8" && !/^\d{8}$/.test(v)) return "EAN-8 must be exactly 8 digits";
  if (t === "UPC" && !/^\d{12}$/.test(v)) return "UPC-A must be exactly 12 digits";
  return null;
}

/** Turn database/network errors into something a counter operator can act on. */
export function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("products_business_barcode_uidx") || m.includes("duplicate key"))
    return "Barcode already registered to another product in this business";
  if (m.includes("barcode feature is disabled"))
    return "Barcode features are turned off for this business";
  if (m.includes("no active business")) return "Choose a business before scanning";
  if (m.includes("access denied")) return "You are not allowed to use this product";
  if (m.includes("insufficient stock")) return message;
  if (m.includes("failed to fetch") || m.includes("networkerror"))
    return "Network problem — check your connection and scan again";
  return message;
}

export async function logBarcodeAudit(
  action: string,
  productId: string | undefined,
  barcode: string,
  extra?: Record<string, unknown>,
) {
  await logAudit("Barcode", action, productId, null, { barcode, ...(extra ?? {}) });
}
