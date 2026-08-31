import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanLine, Keyboard } from "lucide-react";
import { normaliseBarcode } from "@/lib/barcode";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string, format?: string) => void;
  title?: string;
};

/** Camera barcode scanner. ZXing is loaded lazily so it never runs during SSR. */
export function BarcodeScannerDialog({ open, onOpenChange, onDetected, title }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const video = videoRef.current;
        if (!video) return;
        controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (stopped || !result) return;
          stopped = true;
          controls?.stop();
          onDetected(normaliseBarcode(result.getText()), String(result.getBarcodeFormat()));
          onOpenChange(false);
        });
      } catch {
        setError(
          "Camera not available. Use a USB/Bluetooth scanner or type the barcode below instead.",
        );
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-4" /> {title ?? "Scan barcode"}
          </DialogTitle>
          <DialogDescription>
            Hold the barcode steady inside the frame. EAN, UPC, Code 128/39 and QR are supported.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{error}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
          </div>
        )}

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Keyboard className="size-3.5" /> Or enter the barcode manually
          </p>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="e.g. 8901234567890"
              onKeyDown={(e) => {
                if (e.key === "Enter" && normaliseBarcode(manual)) {
                  onDetected(normaliseBarcode(manual), "MANUAL");
                  setManual("");
                  onOpenChange(false);
                }
              }}
            />
            <Button
              type="button"
              disabled={!normaliseBarcode(manual)}
              onClick={() => {
                onDetected(normaliseBarcode(manual), "MANUAL");
                setManual("");
                onOpenChange(false);
              }}
            >
              Use
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Always-focused barcode field for USB/Bluetooth scanners that type like a keyboard.
 * Fires on Enter (scanner suffix), then clears and refocuses for the next scan.
 */
export function BarcodeInput({
  onScan,
  placeholder = "Scan or type barcode, then press Enter",
  autoFocus = true,
  disabled,
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus();
  }, [autoFocus, disabled]);

  return (
    <Input
      ref={ref}
      disabled={disabled}
      value={value}
      autoComplete="off"
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (autoFocus && !disabled) setTimeout(() => ref.current?.focus(), 120);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const code = normaliseBarcode(value);
        setValue("");
        if (code) onScan(code);
      }}
    />
  );
}
