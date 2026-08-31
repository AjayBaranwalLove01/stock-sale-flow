import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Printer } from "lucide-react";
import { guessBarcodeType, normaliseBarcode } from "@/lib/barcode";
import { inr } from "@/lib/format";

export type LabelProduct = {
  name: string;
  sku: string;
  barcode: string;
  barcode_type?: string | null;
  selling_price?: number | null;
};

function barcodeSvgMarkup(product: LabelProduct): string {
  const code = normaliseBarcode(product.barcode);
  const wanted = product.barcode_type && product.barcode_type !== "QR" ? product.barcode_type : null;
  const format = wanted ?? guessBarcodeType(code);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, { format, width: 2, height: 48, fontSize: 13, margin: 4 });
  } catch {
    JsBarcode(svg, code, { format: "CODE128", width: 2, height: 48, fontSize: 13, margin: 4 });
  }
  return svg.outerHTML;
}

export function BarcodePreview({ product }: { product: LabelProduct }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = barcodeSvgMarkup(product);
  }, [product]);
  return <div ref={ref} className="flex justify-center [&_svg]:max-w-full" />;
}

export function BarcodeLabelDialog({
  product,
  businessName,
  onClose,
}: {
  product: LabelProduct | null;
  businessName: string;
  onClose: () => void;
}) {
  const [copies, setCopies] = useState("6");
  const [showPrice, setShowPrice] = useState(true);

  function print() {
    if (!product) return;
    const count = Math.max(1, Math.min(200, Number(copies) || 1));
    const svg = barcodeSvgMarkup(product);
    const price =
      showPrice && product.selling_price != null
        ? `<div class="price">Price: ${inr(product.selling_price)}</div>`
        : "";
    const label = `
      <div class="label">
        <div class="biz">${escapeHtml(businessName)}</div>
        <div class="name">${escapeHtml(product.name)}</div>
        <div class="sku">SKU: ${escapeHtml(product.sku)}</div>
        ${svg}
        ${price}
      </div>`;

    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Barcode labels</title><style>
      * { box-sizing: border-box; font-family: system-ui, sans-serif; }
      body { margin: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .label { border: 1px dashed #bbb; padding: 8px; text-align: center; page-break-inside: avoid; }
      .biz { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
      .name { font-size: 12px; font-weight: 600; margin-top: 2px; }
      .sku { font-size: 10px; color: #555; }
      .price { font-size: 12px; font-weight: 600; }
      svg { max-width: 100%; }
      @media print { .label { border-color: transparent; } }
    </style></head><body>${label.repeat(count)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print barcode labels</DialogTitle>
          <DialogDescription>
            Labels carry the business name, product, SKU, barcode and optionally the price.
          </DialogDescription>
        </DialogHeader>

        {product && (
          <div className="rounded-lg border p-4 text-center">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{businessName}</p>
            <p className="text-sm font-semibold">{product.name}</p>
            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
            <BarcodePreview product={product} />
            {showPrice && product.selling_price != null && (
              <p className="text-sm font-semibold">Price: {inr(product.selling_price)}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 items-end gap-3">
          <div>
            <Label htmlFor="label-copies">Number of labels</Label>
            <Input
              id="label-copies"
              type="number"
              min={1}
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="label-price" checked={showPrice} onCheckedChange={setShowPrice} />
            <Label htmlFor="label-price">Show price</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={print}>
            <Printer className="mr-1.5 size-4" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
