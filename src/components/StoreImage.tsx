import { Package } from "lucide-react";
import { useImageUrl } from "@/lib/images";

/** Shows a stored catalog image (storage path or full URL) with a placeholder fallback. */
export function StoreImage({
  path,
  alt,
  iconClass = "size-8",
}: {
  path?: string | null;
  alt: string;
  iconClass?: string;
}) {
  const isUrl = !!path && /^https?:\/\//.test(path);
  const { data } = useImageUrl(isUrl ? null : path);
  const src = isUrl ? path : data;
  if (!src) {
    return (
      <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
        <Package className={iconClass} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="size-full object-contain"
    />
  );
}
