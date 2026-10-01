import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize2,
  Share2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Package,
  Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

export interface GalleryItem {
  id?: string;
  sm?: string | null;
  md?: string | null;
  lg?: string | null;
  alt?: string;
}

export interface ProductImageGalleryProps {
  images: GalleryItem[];
  productName: string;
  className?: string;
}

/** Resolves an image path (or URL) into a displayable URL */
export function useResolvedUrl(path?: string | null): string | null {
  const isUrl = !!path && /^https?:\/\//.test(path);
  const { data } = useImageUrl(isUrl ? null : path);
  if (!path) return null;
  return isUrl ? path : data ?? null;
}

export function ProductImageGallery({
  images,
  productName,
  className,
}: ProductImageGalleryProps) {
  // Deduplicate and sanitize images
  const cleanImages = useMemo(() => {
    const list: GalleryItem[] = [];
    const seen = new Set<string>();
    for (const img of images) {
      const key = img.lg || img.md || img.sm;
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(img);
      }
    }
    return list;
  }, [images]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = cleanImages[activeIndex] ?? cleanImages[0];


  // Lightbox / Full view state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // DOM Refs
  const mainCardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const thumbScrollRef = useRef<HTMLDivElement>(null);

  // Active image URLs
  const activeMainPath = activeItem?.lg || activeItem?.md || activeItem?.sm;
  const activeMainUrl = useResolvedUrl(activeMainPath);
  const activeHighResUrl = useResolvedUrl(activeItem?.lg || activeItem?.md || activeItem?.sm);

  // Reset active index if list changes
  useEffect(() => {
    if (activeIndex >= cleanImages.length && cleanImages.length > 0) {
      setActiveIndex(0);
    }
  }, [cleanImages.length, activeIndex]);

  // Zoom magnification factor
  const ZOOM_FACTOR = 2.5;
  const ZOOM_WINDOW_SIZE = 480;

  // Magnifier state
  const [isHovering, setIsHovering] = useState(false);
  const [lensState, setLensState] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    boundedX: number;
    boundedY: number;
    imgWidth: number;
    imgHeight: number;
  }>({ x: 0, y: 0, w: 120, h: 120, boundedX: 0, boundedY: 0, imgWidth: 400, imgHeight: 400 });

  // Handle cursor movement for high-precision lens and zoom pane
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      const img = imgRef.current;
      if (!container || !img) return;

      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

      if (imgRect.width === 0 || imgRect.height === 0) return;

      // Image offset within container
      const imgOffsetX = imgRect.left - containerRect.left;
      const imgOffsetY = imgRect.top - containerRect.top;

      // Cursor position within visible rendered image
      const imgX = Math.max(0, Math.min(e.clientX - imgRect.left, imgRect.width));
      const imgY = Math.max(0, Math.min(e.clientY - imgRect.top, imgRect.height));

      // Lens dimensions based on zoom window size and zoom factor
      const idealLensW = ZOOM_WINDOW_SIZE / ZOOM_FACTOR;
      const idealLensH = ZOOM_WINDOW_SIZE / ZOOM_FACTOR;
      const lensW = Math.min(idealLensW, imgRect.width * 0.9);
      const lensH = Math.min(idealLensH, imgRect.height * 0.9);

      // Clamp lens within the visible rendered image boundaries
      const maxLensX = Math.max(0, imgRect.width - lensW);
      const maxLensY = Math.max(0, imgRect.height - lensH);
      const boundedX = Math.max(0, Math.min(imgX - lensW / 2, maxLensX));
      const boundedY = Math.max(0, Math.min(imgY - lensH / 2, maxLensY));

      // Lens position relative to container
      const lensX = imgOffsetX + boundedX;
      const lensY = imgOffsetY + boundedY;

      setLensState({
        x: lensX,
        y: lensY,
        w: lensW,
        h: lensH,
        boundedX,
        boundedY,
        imgWidth: imgRect.width,
        imgHeight: imgRect.height,
      });
    },
    [ZOOM_FACTOR, ZOOM_WINDOW_SIZE],
  );

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  // Lightbox handlers
  const handleNext = useCallback(() => {
    if (cleanImages.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % cleanImages.length);
    setLightboxZoom(1);
    setLightboxPan({ x: 0, y: 0 });
  }, [cleanImages.length]);

  const handlePrev = useCallback(() => {
    if (cleanImages.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + cleanImages.length) % cleanImages.length);
    setLightboxZoom(1);
    setLightboxPan({ x: 0, y: 0 });
  }, [cleanImages.length]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, handleNext, handlePrev]);

  // Share button action
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: productName,
          url: window.location.href,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Product link copied to clipboard");
    }
  };

  // Thumbnail scrolling helpers
  const scrollThumbnails = (direction: "up" | "down" | "left" | "right") => {
    const el = thumbScrollRef.current;
    if (!el) return;
    const distance = 120;
    if (direction === "up") el.scrollBy({ top: -distance, behavior: "smooth" });
    if (direction === "down") el.scrollBy({ top: distance, behavior: "smooth" });
    if (direction === "left") el.scrollBy({ left: -distance, behavior: "smooth" });
    if (direction === "right") el.scrollBy({ left: distance, behavior: "smooth" });
  };

  const hasMultipleImages = cleanImages.length > 1;

  // Offset calculation for the zoom window
  const zoomOffsetX = lensState.boundedX * ZOOM_FACTOR;
  const zoomOffsetY = lensState.boundedY * ZOOM_FACTOR;

  return (
    <div className={cn("relative flex flex-col md:flex-row gap-3 select-none", className)}>
      {/* 1. Left Thumbnail Column on Desktop / Horizontal Row on Mobile */}
      {hasMultipleImages && (
        <div className="order-2 md:order-1 flex md:flex-col items-center gap-1.5 shrink-0">
          {/* Desktop scroll-up button */}
          <button
            type="button"
            onClick={() => scrollThumbnails("up")}
            aria-label="Scroll thumbnails up"
            className="hidden md:flex size-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronUp className="size-3.5" />
          </button>

          {/* Thumbnails container */}
          <div
            ref={thumbScrollRef}
            className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto max-h-[460px] lg:max-h-[520px] w-full md:w-20 lg:w-24 p-0.5 scrollbar-thin scrollbar-thumb-muted-foreground/20"
          >
            {cleanImages.map((img, i) => (
              <ThumbnailButton
                key={img.id || img.lg || img.md || img.sm || i}
                item={img}
                index={i}
                isActive={i === activeIndex}
                productName={productName}
                onClick={() => setActiveIndex(i)}
              />
            ))}
          </div>

          {/* Desktop scroll-down button */}
          <button
            type="button"
            onClick={() => scrollThumbnails("down")}
            aria-label="Scroll thumbnails down"
            className="hidden md:flex size-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
      )}

      {/* 2. Main Large Image Display with Lens & Action Buttons */}
      <div className="order-1 md:order-2 flex-1 flex flex-col items-center">
        <div
          ref={mainCardRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={() => {
            // Open lightbox on mobile tap or when clicking main card
            setLightboxOpen(true);
            setLightboxZoom(1);
            setLightboxPan({ x: 0, y: 0 });
          }}
          className="group relative aspect-square w-full rounded-2xl border border-border/70 bg-white dark:bg-card p-3 shadow-xs flex items-center justify-center overflow-visible cursor-crosshair"
        >
          {/* Main Product Image Container */}
          <div
            ref={containerRef}
            className="relative size-full flex items-center justify-center overflow-hidden rounded-xl"
          >
            {activeMainUrl ? (
              <img
                ref={imgRef}
                src={activeMainUrl}
                alt={productName}
                className="max-h-full max-w-full object-contain pointer-events-none select-none transition-opacity duration-200"
                loading="eager"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center text-muted-foreground/60 gap-2">
                <Package className="size-14 stroke-1" />
                <span className="text-xs">No image available</span>
              </div>
            )}

            {/* Magnifier Lens Indicator (matching the reference image) */}
            {isHovering && activeMainUrl && (
              <div
                style={{
                  transform: `translate3d(${lensState.x}px, ${lensState.y}px, 0)`,
                  width: `${lensState.w}px`,
                  height: `${lensState.h}px`,
                }}
                className="pointer-events-none absolute left-0 top-0 rounded-md border-2 border-sky-400 bg-sky-400/20 shadow-sm backdrop-blur-[0.5px] will-change-transform hidden md:block"
              >
                {/* Dotted grid texture matching reference image */}
                <div
                  className="size-full opacity-60"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, #0284c7 1.2px, transparent 1.2px)",
                    backgroundSize: "7px 7px",
                  }}
                />
              </div>
            )}
          </div>

          {/* Floating actions: Share & Fullscreen */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              title="Share product"
              className="size-8 rounded-full bg-background/85 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-background flex items-center justify-center shadow-xs transition-colors cursor-pointer"
            >
              <Share2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
                setLightboxZoom(1);
                setLightboxPan({ x: 0, y: 0 });
              }}
              title="Click to see full view"
              className="size-8 rounded-full bg-background/85 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-background flex items-center justify-center shadow-xs transition-colors cursor-pointer"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>

          {/* 3. Magnified Zoom Window (Flyout on Desktop, matching reference) */}
          {isHovering && activeHighResUrl && (
            <div
              className="pointer-events-none absolute left-[calc(100%+16px)] top-0 z-50 hidden aspect-square w-[460px] lg:w-[520px] xl:w-[560px] overflow-hidden rounded-2xl border border-border/80 bg-white dark:bg-card shadow-2xl md:block animate-in fade-in-0 zoom-in-95 duration-150"
              style={{
                height: mainCardRef.current?.clientHeight || 480,
              }}
            >
              <div className="relative size-full overflow-hidden bg-white dark:bg-card">
                <img
                  src={activeHighResUrl}
                  alt={productName}
                  className="absolute left-0 top-0 max-w-none will-change-transform"
                  style={{
                    width: `${lensState.imgWidth * ZOOM_FACTOR}px`,
                    height: `${lensState.imgHeight * ZOOM_FACTOR}px`,
                    transform: `translate3d(-${zoomOffsetX}px, -${zoomOffsetY}px, 0)`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Click to see full view link (matching reference) */}
        <button
          type="button"
          onClick={() => {
            setLightboxOpen(true);
            setLightboxZoom(1);
            setLightboxPan({ x: 0, y: 0 });
          }}
          className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline transition-colors cursor-pointer"
        >
          <Search className="size-3.5" />
          <span>Click to see full view</span>
        </button>
      </div>

      {/* 4. Full View Lightbox Modal */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[96vw] md:max-w-5xl h-[90vh] p-0 overflow-hidden bg-black/95 text-white border-white/10 rounded-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-base font-semibold text-white truncate max-w-[280px] sm:max-w-md">
                {productName}
              </DialogTitle>
              {hasMultipleImages && (
                <Badge variant="outline" className="text-xs text-white/80 border-white/20">
                  {activeIndex + 1} / {cleanImages.length}
                </Badge>
              )}
            </div>

            {/* Zoom & View Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-white hover:bg-white/10"
                onClick={() => setLightboxZoom((z) => Math.max(1, z - 0.5))}
                disabled={lightboxZoom <= 1}
                title="Zoom out"
              >
                <ZoomOut className="size-4" />
              </Button>
              <span className="text-xs text-white/70 w-10 text-center font-mono">
                {Math.round(lightboxZoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-white hover:bg-white/10"
                onClick={() => setLightboxZoom((z) => Math.min(4, z + 0.5))}
                disabled={lightboxZoom >= 4}
                title="Zoom in"
              >
                <ZoomIn className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-white hover:bg-white/10"
                onClick={() => {
                  setLightboxZoom(1);
                  setLightboxPan({ x: 0, y: 0 });
                }}
                title="Reset zoom"
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-white hover:bg-white/10 ml-2"
                onClick={() => setLightboxOpen(false)}
                title="Close"
              >
                <X className="size-5" />
              </Button>
            </div>
          </div>

          {/* Interactive Zoom & Pan Viewport */}
          <div
            className={cn(
              "relative flex-1 overflow-hidden flex items-center justify-center bg-black/60",
              lightboxZoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
            )}
            onMouseDown={(e) => {
              if (lightboxZoom <= 1) return;
              setIsDragging(true);
              dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                panX: lightboxPan.x,
                panY: lightboxPan.y,
              };
            }}
            onMouseMove={(e) => {
              if (!isDragging) return;
              const dx = e.clientX - dragStartRef.current.x;
              const dy = e.clientY - dragStartRef.current.y;
              setLightboxPan({
                x: dragStartRef.current.panX + dx,
                y: dragStartRef.current.panY + dy,
              });
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            {activeHighResUrl ? (
              <img
                src={activeHighResUrl}
                alt={productName}
                style={{
                  transform: `scale(${lightboxZoom}) translate(${lightboxPan.x / lightboxZoom}px, ${lightboxPan.y / lightboxZoom}px)`,
                  transition: isDragging ? "none" : "transform 0.15s ease-out",
                }}
                className="max-h-[75vh] max-w-[85vw] object-contain select-none will-change-transform"
                draggable={false}
              />
            ) : (
              <div className="text-white/60 text-sm">No high-resolution image</div>
            )}

            {/* Lightbox Prev / Next buttons */}
            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>

          {/* Bottom Thumbnail Strip in Lightbox */}
          {hasMultipleImages && (
            <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/80 border-t border-white/10 overflow-x-auto shrink-0">
              {cleanImages.map((img, i) => (
                <ThumbnailButton
                  key={img.id || img.lg || img.md || img.sm || i}
                  item={img}
                  index={i}
                  isActive={i === activeIndex}
                  productName={productName}
                  onClick={() => {
                    setActiveIndex(i);
                    setLightboxZoom(1);
                    setLightboxPan({ x: 0, y: 0 });
                  }}
                  isDark
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Individual Thumbnail Button */
function ThumbnailButton({
  item,
  index,
  isActive,
  productName,
  onClick,
  isDark = false,
}: {
  item: GalleryItem;
  index: number;
  isActive: boolean;
  productName: string;
  onClick: () => void;
  isDark?: boolean;
}) {
  const thumbPath = item.sm || item.md || item.lg;
  const thumbUrl = useResolvedUrl(thumbPath);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View photo ${index + 1} of ${productName}`}
      className={cn(
        "group relative aspect-square size-14 md:size-16 shrink-0 overflow-hidden rounded-xl border p-1 transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isDark
          ? isActive
            ? "border-primary ring-2 ring-primary bg-white/10 scale-105"
            : "border-white/20 hover:border-white/60 bg-white/5 opacity-70 hover:opacity-100"
          : isActive
            ? "border-foreground ring-2 ring-primary/40 bg-white dark:bg-card shadow-sm scale-105"
            : "border-border/70 hover:border-foreground/50 bg-muted/40 hover:bg-white dark:hover:bg-card opacity-80 hover:opacity-100",
      )}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={`${productName} thumbnail ${index + 1}`}
          className="size-full object-contain transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground/60">
          <Package className="size-4" />
        </div>
      )}
    </button>
  );
}
