import { supabase } from "@/integrations/supabase/client";

export const RECEIPT_BUCKET = "catalog-images";

export interface PurchaseReceiptMeta {
  path: string;
  fileName: string;
  fileType: "pdf" | "image";
  fileSize?: number;
  uploadedAt: string;
}

/** Parse embedded receipt metadata from purchase notes */
export function parsePurchaseNotes(notes: string | null | undefined): {
  userNotes: string;
  receipt: PurchaseReceiptMeta | null;
} {
  if (!notes) return { userNotes: "", receipt: null };
  const marker = "[Receipt:";
  const idx = notes.indexOf(marker);
  if (idx === -1) return { userNotes: notes, receipt: null };

  const userNotes = notes.slice(0, idx).trim();
  const endIdx = notes.indexOf("]", idx);
  if (endIdx === -1) return { userNotes: notes, receipt: null };

  try {
    const jsonStr = notes.slice(idx + marker.length, endIdx).trim();
    const receipt = JSON.parse(jsonStr) as PurchaseReceiptMeta;
    return { userNotes, receipt };
  } catch {
    return { userNotes: notes, receipt: null };
  }
}

/** Embed receipt metadata into purchase notes cleanly */
export function formatPurchaseNotes(
  userNotes: string,
  receipt: PurchaseReceiptMeta | null,
): string {
  const trimmed = userNotes.trim();
  if (!receipt) return trimmed;
  const marker = `[Receipt: ${JSON.stringify(receipt)}]`;
  return trimmed ? `${trimmed}\n${marker}` : marker;
}

/** Upload purchase receipt file (PDF, JPG, PNG) into storage */
export async function uploadPurchaseReceipt(
  file: File,
  businessId: string,
): Promise<PurchaseReceiptMeta> {
  const validTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  if (!validTypes.includes(file.type.toLowerCase())) {
    throw new Error(
      "Invalid file format. Please upload a receipt in PDF, JPG, JPEG, or PNG format.",
    );
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Receipt file size cannot exceed 15MB.");
  }

  const isPdf = file.type.toLowerCase() === "application/pdf";
  const ext = file.name.split(".").pop()?.toLowerCase() || (isPdf ? "pdf" : "jpg");
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `purchase-receipts/${businessId}/${stamp}-${sanitized}`;

  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;

  return {
    path,
    fileName: file.name,
    fileType: isPdf ? "pdf" : "image",
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

/** Retrieve signed URL for secure receipt viewing and downloading */
export async function getPurchaseReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Update the receipt attached to an existing purchase record */
export async function updatePurchaseReceiptRecord(
  purchaseId: string,
  newReceipt: PurchaseReceiptMeta | null,
  currentNotes: string | null | undefined,
): Promise<string> {
  const { userNotes } = parsePurchaseNotes(currentNotes);
  const updatedNotes = formatPurchaseNotes(userNotes, newReceipt);

  const { error } = await supabase
    .from("purchases")
    .update({ notes: updatedNotes })
    .eq("id", purchaseId);

  if (error) throw error;
  return updatedNotes;
}

/** Download receipt file securely using signed URL */
export async function downloadReceipt(path: string, fileName: string): Promise<void> {
  const url = await getPurchaseReceiptUrl(path);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
