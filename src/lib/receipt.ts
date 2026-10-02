import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useEnabledFeatures, useActiveBusiness } from "@/hooks/useTenant";
import { useSettings, logAudit } from "@/lib/queries";

export const RECEIPT_FEATURE = "receipt_printing";
export const INVOICE_FEATURE = "invoice_printing";
export const THERMAL_FEATURE = "thermal_printer";
export const A4_FEATURE = "a4_invoice";
export const REPRINT_FEATURE = "receipt_reprint";

export const PRINTER_TYPES = [
  { value: "thermal58", label: "Thermal 58mm" },
  { value: "thermal80", label: "Thermal 80mm" },
  { value: "a4", label: "A4 Invoice" },
  { value: "a5", label: "A5 Invoice" },
] as const;

export type PrinterType = (typeof PRINTER_TYPES)[number]["value"];

export const PRINTER_CONNECTIONS = [
  { value: "system", label: "System printer (browser print)" },
  { value: "network", label: "Network printer (IP)" },
  { value: "agent", label: "Local print service (agent)" },
] as const;

export type ReceiptPermission =
  | "print_receipt"
  | "reprint_receipt"
  | "print_invoice"
  | "download_invoice"
  | "manage_printer_settings";

const PERMISSIONS: Record<AppRole, ReceiptPermission[]> = {
  credit_officer: [],
  super_admin: [
    "print_receipt",
    "reprint_receipt",
    "print_invoice",
    "download_invoice",
    "manage_printer_settings",
  ],
  admin: [
    "print_receipt",
    "reprint_receipt",
    "print_invoice",
    "download_invoice",
    "manage_printer_settings",
  ],
  billing_user: ["print_receipt", "reprint_receipt", "print_invoice", "download_invoice"],
  inventory_user: [],
};

export interface ReceiptSettings {
  receipt_enabled: boolean;
  receipt_printer_type: PrinterType;
  receipt_auto_print: boolean;
  receipt_copies: number;
  receipt_show_logo: boolean;
  receipt_show_barcode: boolean;
  receipt_show_qr: boolean;
  receipt_show_customer: boolean;
  receipt_show_tax: boolean;
  receipt_show_cashier: boolean;
  printer_name: string | null;
  printer_connection: string;
  printer_host: string | null;
  printer_port: number | null;
  receipt_footer: string | null;
  receipt_return_policy: string | null;
  receipt_support_info: string | null;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  receipt_enabled: true,
  receipt_printer_type: "thermal80",
  receipt_auto_print: false,
  receipt_copies: 1,
  receipt_show_logo: true,
  receipt_show_barcode: false,
  receipt_show_qr: false,
  receipt_show_customer: true,
  receipt_show_tax: true,
  receipt_show_cashier: true,
  printer_name: null,
  printer_connection: "system",
  printer_host: null,
  printer_port: null,
  receipt_footer: null,
  receipt_return_policy: null,
  receipt_support_info: null,
};

/** Feature flags (global + per business) combined with the user's role permissions. */
export function useReceipts() {
  const { roles } = useAuth();
  const { enabled } = useEnabledFeatures();
  const { data: settings } = useSettings();
  const { data: business } = useActiveBusiness();

  const receiptOn = enabled(RECEIPT_FEATURE);
  const invoiceOn = enabled(INVOICE_FEATURE);
  const thermalOn = enabled(THERMAL_FEATURE);
  const a4On = enabled(A4_FEATURE);
  const reprintOn = enabled(REPRINT_FEATURE);

  const cfg: ReceiptSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...((settings ?? {}) as Partial<ReceiptSettings>),
  };

  return useMemo(() => {
    const granted = new Set(roles.flatMap((r) => PERMISSIONS[r] ?? []));
    const featureFor = (p: ReceiptPermission) => {
      if (p === "manage_printer_settings") return receiptOn || invoiceOn;
      if (p === "reprint_receipt") return receiptOn && reprintOn;
      if (p === "print_receipt") return receiptOn && cfg.receipt_enabled;
      return invoiceOn;
    };
    return {
      settings: cfg,
      business: business ?? null,
      receiptEnabled: receiptOn && cfg.receipt_enabled,
      invoiceEnabled: invoiceOn,
      thermalEnabled: thermalOn,
      a4Enabled: a4On,
      reprintEnabled: receiptOn && reprintOn,
      can: (p: ReceiptPermission) => granted.has(p) && featureFor(p),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, receiptOn, invoiceOn, thermalOn, a4On, reprintOn, JSON.stringify(cfg), business?.id]);
}

/* ---------------- data ---------------- */

export interface ReceiptItem {
  id?: string;
  product_name: string;
  sku?: string | null;
  barcode?: string | null;
  hsn_code?: string | null;
  quantity: number;
  rate: number;
  discount?: number;
  gst_rate: number;
  tax_amount?: number;
  total: number;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
}

export interface ReceiptSale {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  customer_mobile?: string | null;
  customer_gstin?: string | null;
  customer_address?: string | null;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  grand_total: number;
  paid_amount: number;
  notes?: string | null;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  cashier?: string | null;
  business_id?: string;
  customer_id?: string | null;
  access_token?: string | null;
}

/** Loads a completed sale (tenant scoped by RLS) for printing. Never mutates anything. */
export async function fetchReceiptSale(saleId: string): Promise<ReceiptSale> {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "*, customers(name,mobile,gstin,address), sale_items(*, products(sku,barcode))",
    )
    .eq("id", saleId)
    .single();
  if (error) throw error;

  const { data: pays } = await supabase
    .from("customer_payments")
    .select("amount, method")
    .eq("sale_id", saleId);

  type Raw = {
    [k: string]: unknown;
    sale_items?: (ReceiptItem & { products?: { sku?: string; barcode?: string } | null })[];
    customers?: { mobile?: string; gstin?: string; address?: string } | null;
  };
  const row = data as unknown as Raw;
  const r = row as Record<string, string & number>;

  return {
    id: String(r["id"]),
    business_id: String(r["business_id"] ?? ""),
    customer_id: r["customer_id"] ? String(r["customer_id"]) : null,
    access_token: r["access_token"] ? String(r["access_token"]) : null,
    invoice_no: String(r["invoice_no"]),
    invoice_date: String(r["invoice_date"]),
    customer_name: String(r["customer_name"] ?? "Walk-in Customer"),
    customer_mobile: row.customers?.mobile ?? null,
    customer_gstin: row.customers?.gstin ?? null,
    customer_address: row.customers?.address ?? null,
    subtotal: Number(r["subtotal"] ?? 0),
    discount_amount: Number(r["discount_amount"] ?? 0),
    taxable_amount: Number(r["taxable_amount"] ?? 0),
    cgst: Number(r["cgst"] ?? 0),
    sgst: Number(r["sgst"] ?? 0),
    igst: Number(r["igst"] ?? 0),
    round_off: Number(r["round_off"] ?? 0),
    grand_total: Number(r["grand_total"] ?? 0),
    paid_amount: Number(r["paid_amount"] ?? 0),
    notes: (row["notes"] as string | null) ?? null,
    items: (row.sale_items ?? []).map((it) => ({
      product_name: it.product_name,
      sku: it.products?.sku ?? null,
      barcode: it.products?.barcode ?? null,
      hsn_code: it.hsn_code ?? null,
      quantity: Number(it.quantity),
      rate: Number(it.rate),
      discount: Number(it.discount ?? 0),
      gst_rate: Number(it.gst_rate),
      tax_amount: Number(it.tax_amount ?? 0),
      total: Number(it.total),
    })),
    payments: ((pays ?? []) as ReceiptPayment[]).map((p) => ({
      method: p.method,
      amount: Number(p.amount),
    })),
  };
}

/* ---------------- print queue ---------------- */

export interface PrintJob {
  id: string;
  saleId: string;
  invoiceNo: string;
  format: PrinterType;
  copies: number;
  createdAt: string;
  error?: string;
}

const QUEUE_KEY = "sk.print-queue";

export function readPrintQueue(): PrintJob[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as PrintJob[];
  } catch {
    return [];
  }
}

function writeQueue(jobs: PrintJob[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs.slice(-50)));
  window.dispatchEvent(new CustomEvent("sk-print-queue"));
}

export function enqueuePrintJob(job: Omit<PrintJob, "id" | "createdAt">) {
  writeQueue([
    ...readPrintQueue(),
    { ...job, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
  ]);
}

export function removePrintJob(id: string) {
  writeQueue(readPrintQueue().filter((j) => j.id !== id));
}

/* ---------------- audit ---------------- */

export function logReceiptAudit(
  action: "RECEIPT_PRINTED" | "RECEIPT_REPRINTED" | "INVOICE_PRINTED" | "INVOICE_DOWNLOADED" | "TEST_PRINT",
  invoiceNo: string,
  printer: string,
  result: "success" | "failed",
) {
  return logAudit("Receipt", action, invoiceNo, null, {
    invoice_no: invoiceNo,
    printer,
    result,
    at: new Date().toISOString(),
  });
}
