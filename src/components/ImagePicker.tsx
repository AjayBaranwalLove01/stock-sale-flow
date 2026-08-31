import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  deleteImageVariants,
  uploadImageVariants,
  useImageUrl,
  type GalleryImage,
  type ImageSizes,
} from "@/lib/images";

type Props = {
  label?: string;
  folder: string;
  /** current stored paths, empty strings when unset */
  value: ImageSizes;
  onChange: (value: ImageSizes) => void;
};

const EMPTY: ImageSizes = { sm: "", md: "", lg: "" };

export function ImagePicker({ label = "Image (optional)", folder, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: previewUrl } = useImageUrl(value.md || value.lg || value.sm || null);

  async function pick(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const next = await uploadImageVariants(file, folder);
      onChange(next);
      toast.success("Image uploaded in 3 sizes");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function clear() {
    const old = value;
    onChange(EMPTY);
    try {
      await deleteImageVariants([old.sm, old.md, old.lg]);
    } catch {
      /* ignore cleanup errors */
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {previewUrl ? (
            <img src={previewUrl} alt="Selected preview" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ImagePlus className="mr-1.5 size-4" />}
            {value.md ? "Replace image" : "Choose image"}
          </Button>
          {value.md && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void clear()}>
              <Trash2 className="mr-1.5 size-4 text-destructive" />
              Remove
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Stored automatically in small (128px), medium (512px) and large (1200px) versions.
      </p>
    </div>
  );
}

export function Thumb({
  path,
  alt,
  className = "size-9",
}: {
  path?: string | null | undefined;
  alt: string;
  className?: string;
}) {

  const { data: url } = useImageUrl(path);
  return (
    <div className={`flex ${className} shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40`}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" className="size-full object-cover" />
      ) : (
        <ImagePlus className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

export { EMPTY as EMPTY_IMAGE };

/* ---------------- Multiple images ---------------- */

function GalleryTile({
  img,
  index,
  onRemove,
  onMakePrimary,
}: {
  img: GalleryImage;
  index: number;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  const { data: url } = useImageUrl(img.md || img.sm || img.lg);
  return (
    <div className="group relative size-24 overflow-hidden rounded-md border bg-muted/40">
      {url ? (
        <img src={url} alt={`Image ${index + 1}`} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <ImagePlus className="size-4 text-muted-foreground" />
        </div>
      )}
      {index === 0 && (
        <span className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
          Main
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/85 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 rounded-none"
          disabled={index === 0}
          title="Make main image"
          onClick={onMakePrimary}
        >
          <Star className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 rounded-none"
          title="Remove image"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export function MultiImagePicker({
  label = "Images (optional)",
  folder,
  value,
  onChange,
}: {
  label?: string;
  folder: string;
  value: GalleryImage[];
  onChange: (value: GalleryImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: GalleryImage[] = [];
      for (const file of Array.from(files)) {
        added.push(await uploadImageVariants(file, folder));
      }
      onChange([...value, ...added]);
      toast.success(`${added.length} image${added.length > 1 ? "s" : ""} uploaded`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(i: number) {
    const img = value[i];
    onChange(value.filter((_, idx) => idx !== i));
    if (img) void deleteImageVariants([img.sm, img.md, img.lg]).catch(() => {});
  }

  function makePrimary(i: number) {
    const next = [...value];
    const [img] = next.splice(i, 1);
    if (img) next.unshift(img);
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((img, i) => (
          <GalleryTile
            key={img.id ?? img.md ?? i}
            img={img}
            index={i}
            onRemove={() => remove(i)}
            onMakePrimary={() => makePrimary(i)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          className="size-24 flex-col gap-1 border-dashed"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          <span className="text-xs">Add images</span>
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void addFiles(e.target.files)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Add as many images as you like — each is stored in small (128px), medium (512px) and large
        (1200px) versions. The first image is used as the main thumbnail.
      </p>
    </div>
  );
}
