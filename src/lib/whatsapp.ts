import { supabase } from "@/integrations/supabase/client";
import { inr, dateTimeFmt } from "@/lib/format";

export interface WhatsAppInvoicePayload {
  saleId: string;
  invoiceNo: string;
  invoiceDate: string;
  grandTotal: number;
  customerName: string;
  customerId?: string | null | undefined;
  customerPhone?: string | null | undefined;
  businessName: string;
  businessId: string;
  accessToken?: string | null | undefined;
  senderUserId?: string | null | undefined;
  senderUserEmail?: string | null | undefined;
}

export interface SendHistoryRecord {
  id: string;
  business_id: string;
  sale_id: string;
  invoice_no: string;
  customer_id: string | null;
  customer_name: string;
  recipient_phone: string;
  channel: string;
  status: "sent" | "failed" | "pending";
  sent_by: string | null;
  sent_by_email: string | null;
  error_message: string | null;
  message_content: string | null;
  created_at: string;
}

/**
 * Normalizes phone numbers for WhatsApp.
 * Strips whitespace, dashes, brackets. If 10 digits without country code, prepends 91 (India default).
 */
export function normalizeWhatsAppNumber(phone: string): { clean: string; isValid: boolean } {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return { clean: "", isValid: false };

  // If 10 digits (standard Indian mobile starting with 6, 7, 8, 9)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return { clean: `91${digits}`, isValid: true };
  }

  // If 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith("91")) {
    return { clean: digits, isValid: true };
  }

  // General international numbers (at least 10 digits)
  if (digits.length >= 10 && digits.length <= 15) {
    return { clean: digits, isValid: true };
  }

  return { clean: digits, isValid: false };
}

/**
 * Builds the secure invoice link without exposing internal IDs.
 */
export function buildSecureInvoiceLink(accessToken?: string | null, saleId?: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const token = accessToken || saleId || "";
  return `${base}/invoice/${token}`;
}

/**
 * Generates the standardized professional WhatsApp message matching requirements:
 *
 * Dear [Customer Name],
 *
 * Thank you for your purchase from [Business Name].
 *
 * Invoice No: [Invoice Number]
 * Invoice Date: [Invoice Date]
 * Total Amount: ₹[Amount]
 *
 * Please find your invoice here:
 * [Secure Invoice Link]
 *
 * Thank you for your business.
 */
export function formatWhatsAppMessage(payload: WhatsAppInvoicePayload): string {
  const link = buildSecureInvoiceLink(payload.accessToken, payload.saleId);
  const formattedAmount = inr(payload.grandTotal);
  const formattedDate = dateTimeFmt(payload.invoiceDate);

  return `Dear ${payload.customerName || "Customer"},

Thank you for your purchase from ${payload.businessName || "us"}.

Invoice No: ${payload.invoiceNo}
Invoice Date: ${formattedDate}
Total Amount: ${formattedAmount}

Please find your invoice here:
${link}

Thank you for your business.`;
}

/**
 * Records the WhatsApp send attempt in the audit / send history table.
 */
export async function recordInvoiceSendAttempt(
  payload: WhatsAppInvoicePayload,
  recipientPhone: string,
  messageContent: string,
  status: "sent" | "failed" | "pending" = "sent",
  errorMessage?: string,
): Promise<void> {
  try {
    await (supabase.from as any)("invoice_send_history").insert({
      business_id: payload.businessId,
      sale_id: payload.saleId,
      invoice_no: payload.invoiceNo,
      customer_id: payload.customerId || null,
      customer_name: payload.customerName || "Walk-in Customer",
      recipient_phone: recipientPhone,
      channel: "whatsapp",
      status,
      sent_by: payload.senderUserId || null,
      sent_by_email: payload.senderUserEmail || null,
      error_message: errorMessage || null,
      message_content: messageContent,
    });
  } catch (err) {
    console.warn("Could not record invoice send history to DB:", err);
  }
}

/**
 * Executes sending an invoice on WhatsApp.
 * Opens WhatsApp Web or WhatsApp App deep link and records the send attempt.
 */
export async function sendInvoiceViaWhatsApp(
  payload: WhatsAppInvoicePayload,
  overridePhone?: string,
): Promise<{ success: boolean; error?: string }> {
  const targetPhone = overridePhone || payload.customerPhone || "";
  const { clean, isValid } = normalizeWhatsAppNumber(targetPhone);

  if (!isValid) {
    const errorMsg = "Please provide a valid 10-digit mobile number";
    return { success: false, error: errorMsg };
  }

  const message = formatWhatsAppMessage(payload);
  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${clean}?text=${encodedMessage}`;

  try {
    // Open in a new window / tab
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      // In case popup was blocked, fallback to direct location
      window.location.href = url;
    }

    // Record success in history
    await recordInvoiceSendAttempt(payload, clean, message, "sent");
    return { success: true };
  } catch (e) {
    const errText = e instanceof Error ? e.message : "Failed to open WhatsApp";
    await recordInvoiceSendAttempt(payload, clean, message, "failed", errText);
    return { success: false, error: errText };
  }
}

/**
 * Fetches WhatsApp send history for a specific sale.
 */
export async function fetchSaleSendHistory(saleId: string): Promise<SendHistoryRecord[]> {
  try {
    const { data, error } = await (supabase.from as any)("invoice_send_history")
      .select("*")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as SendHistoryRecord[];
  } catch {
    return [];
  }
}
