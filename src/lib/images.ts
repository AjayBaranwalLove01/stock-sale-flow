import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const IMAGE_BUCKET = "catalog-images";

export type ImageSizes = { sm: string; md: string; lg: string };

const SIZES: { key: keyof ImageSizes; max: number }[] = [
  { key: "sm", max: 128 },
  { key: "md", max: 512 },
  { key: "lg", max: 1200 },
];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file"));
    };
    img.src = url;
  });
}

function resize(img: HTMLImageElement, max: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported in this browser");
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image conversion failed"))),
      "image/jpeg",
      0.85,
    ),
  );
}

/** Resizes a picked file into small/medium/large JPEGs and uploads them. Returns storage paths. */
export async function uploadImageVariants(file: File, folder: string): Promise<ImageSizes> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.size > 10 * 1024 * 1024) throw new Error("Image must be smaller than 10MB");
  const img = await loadImage(file);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const out = {} as ImageSizes;
  for (const s of SIZES) {
    const blob = await resize(img, s.max);
    const path = `${folder}/${stamp}-${s.key}.jpg`;
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    out[s.key] = path;
  }
  return out;
}

export async function deleteImageVariants(paths: (string | null | undefined)[]) {
  const list = paths.filter(Boolean) as string[];
  if (!list.length) return;
  await supabase.storage.from(IMAGE_BUCKET).remove(list);
}

export async function getSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Signed URL for a stored image path (null-safe). Refetches before expiry. */
export function useImageUrl(path?: string | null) {
  return useQuery({
    queryKey: ["image-url", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: () => getSignedUrl(path as string),
  });
}

/* ---------------- Multiple images (gallery) ---------------- */

export type GalleryEntity = "product" | "category";

export type GalleryImage = ImageSizes & { id?: string };

/** All gallery images for a product or category, ordered. */
export function useGallery(entityType: GalleryEntity, entityId?: string | null) {
  return useQuery({
    queryKey: ["catalog-images", entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<GalleryImage[]> => {
      const { data, error } = await supabase
        .from("catalog_images")
        .select("id, image_sm, image_md, image_lg, sort_order")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId as string)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        sm: r.image_sm,
        md: r.image_md,
        lg: r.image_lg,
      }));
    },
  });
}

export async function fetchGallery(entityType: GalleryEntity, entityId: string): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from("catalog_images")
    .select("id, image_sm, image_md, image_lg, sort_order")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, sm: r.image_sm, md: r.image_md, lg: r.image_lg }));
}

/** Replaces the stored gallery for an entity with the given ordered list. */
export async function saveGallery(
  entityType: GalleryEntity,
  entityId: string,
  images: GalleryImage[],
) {
  const { error: delErr } = await supabase
    .from("catalog_images")
    .delete()
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (delErr) throw delErr;
  if (!images.length) return;
  const rows = images.map((img, i) => ({
    entity_type: entityType,
    entity_id: entityId,
    image_sm: img.sm,
    image_md: img.md,
    image_lg: img.lg,
    sort_order: i,
  }));
  const { error } = await supabase.from("catalog_images").insert(rows);
  if (error) throw error;
}
