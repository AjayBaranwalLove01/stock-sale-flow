import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Printer, FileText, Download, Plus, RotateCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/lib/queries";
import { useActiveBusiness } from "@/hooks/useTenant";
import {
  enqueuePrintJob,
  fetchReceiptSale,
  logReceiptAudit,
  PRINTER_TYPES,
  useReceipts,
  type PrinterType,
  type ReceiptSale,
} from "@/lib/receipt";
import {
  buildInvoiceHtml,
  buildReceiptHtml,
  buildTestPrintHtml,
  printHtml,
  type PrintContext,
} from "@/lib/receipt-render";
import { inr } from "@/lib/format";

/** Everything a receipt/invoice needs, always scoped to the active business. */
export function usePrinter() {
  const receipts = useReceipts();
  const { data: settings } = useSettings();
  const { data: business } = useActiveBusiness();
  const { user } = useAuth();

  const cfg = receipts.settings;

  const ctx: PrintContext = {
    business_name: (settings?.business_name as string) ?? business?.name ?? "Business",
    address: (settings?.address as string) ?? business?.address ?? null,
    phone: (settings?.phone as string) ?? business?.phone ?? null,
    email: (settings?.email as string) ?? business?.email ?? null,
    gstin: (settings?.gstin as string) ?? null,
    website: (settings?.website as string) ?? business?.website ?? null,
    logo_url: (settings?.logo_url as string) ?? business?.logo_url ?? null,
    storefront: business?.subdomain ? `/shop/${business.subdomain}` : null,
    terms: (settings?.terms_conditions as string) ?? null,
    cashier: user?.email ?? null,
    settings: cfg,
  };

  const printReceipt = useCallback(
    async (sale: ReceiptSale, kind?: PrinterType, reprint = false) => {
      const format: PrinterType =
        kind ?? (cfg.receipt_printer_type === "a4" || cfg.receipt_printer_type === "a5"
          ? "thermal80"
          : cfg.receipt_printer_type);
      const printer = cfg.printer_name || "System printer";
      try {
        const html = await buildReceiptHtml(sale, ctx, format);
        await printHtml(html, cfg.receipt_copies);
        void logReceiptAudit(
          reprint ? "RECEIPT_REPRINTED" : "RECEIPT_PRINTED",
          sale.invoice_no,
          `${printer} (${format})`,
          "success",
        );
      } catch (e) {
        enqueuePrintJob({
          saleId: sale.id,
          invoiceNo: sale.invoice_no,
          format,
          copies: cfg.receipt_copies,
          error: e instanceof Error ? e.message : "Print failed",
        });
        void logReceiptAudit(
          reprint ? "RECEIPT_REPRINTED" : "RECEIPT_PRINTED",
          sale.invoice_no,
          `${printer} (${format})`,
          "failed",
        );
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ctx)],
  );

  const printInvoice = useCallback(
    async (sale: ReceiptSale, kind: PrinterType = "a4") => {
      const html = await buildInvoiceHtml(sale, ctx, kind);
      await printHtml(html, 1);
      void logReceiptAudit("INVOICE_PRINTED", sale.invoice_no, kind.toUpperCase(), "success");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ctx)],
  );

  const downloadInvoice = useCallback(
    async (sale: ReceiptSale, kind: PrinterType = "a4") => {
      const html = await buildInvoiceHtml(sale, ctx, kind);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sale.invoice_no}.html`;
      a.click();
      URL.revokeObjectURL(url);
      void logReceiptAudit("INVOICE_DOWNLOADED", sale.invoice_no, kind.toUpperCase(), "success");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ctx)],
  );

  const testPrint = useCallback(
    async (kind: PrinterType) => {
      await printHtml(buildTestPrintHtml(ctx, kind), 1);
      void logReceiptAudit("TEST_PRINT", "TEST", `${cfg.printer_name || "System printer"} (${kind})`, "success");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ctx)],
  );

  return { ...receipts, ctx, printReceipt, printInvoice, downloadInvoice, testPrint };
}

/** Loads a sale by id and prints it — never touches stock, payments or invoice numbers. */
export function useSalePrinting() {
  const printer = usePrinter();
  const [busy, setBusy] = useState(false);

  const run = async (saleId: string, what: "receipt" | "invoice" | "download", reprint = false) => {
    setBusy(true);
    try {
      const sale = await fetchReceiptSale(saleId);
      if (what === "receipt") await printer.printReceipt(sale, undefined, reprint);
      else if (what === "invoice") await printer.printInvoice(sale);
      else await printer.downloadInvoice(sale);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not print");
    } finally {
      setBusy(false);
    }
  };

  return { ...printer, busy, run };
}

/** Row-level print actions for sales history / sale details. */
export function ReceiptActions({ saleId, reprint = false }: { saleId: string; reprint?: boolean }) {
  const p = useSalePrinting();
  const canReceipt = reprint ? p.can("reprint_receipt") : p.can("print_receipt");

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canReceipt && (
        <Button variant="outline" size="sm" disabled={p.busy} onClick={() => void p.run(saleId, "receipt", reprint)}>
          <Printer className="mr-1.5 size-4" /> {reprint ? "Reprint Receipt" : "Print Receipt"}
        </Button>
      )}
      {p.can("print_invoice") && p.a4Enabled && (
        <Button variant="outline" size="sm" disabled={p.busy} onClick={() => void p.run(saleId, "invoice")}>
          <FileText className="mr-1.5 size-4" /> Print A4 Invoice
        </Button>
      )}
      {p.can("download_invoice") && p.a4Enabled && (
        <Button variant="outline" size="sm" disabled={p.busy} onClick={() => void p.run(saleId, "download")}>
          <Download className="mr-1.5 size-4" /> Download
        </Button>
      )}
    </div>
  );
}

/**
 * Shown after a sale is saved. The sale is already complete — nothing here can
 * change stock, payments or the invoice number.
 */
export function PostSaleDialog({
  saleId,
  onNewSale,
}: {
  saleId: string | null;
  onNewSale: () => void;
}) {
  const p = usePrinter();
  const [sale, setSale] = useState<ReceiptSale | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load the saved sale once, then auto print when the business asked for it.
  if (saleId && loadedFor !== saleId) {
    setLoadedFor(saleId);
    setSale(null);
    setFailed(false);
    void (async () => {
      try {
        const s = await fetchReceiptSale(saleId);
        setSale(s);
        if (p.settings.receipt_auto_print && p.can("print_receipt")) {
          try {
            await p.printReceipt(s);
          } catch {
            setFailed(true);
          }
        }
      } catch {
        toast.error("Sale saved, but the invoice could not be loaded for printing");
      }
    })();
  }

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setFailed(false);
    } catch {
      setFailed(true);
      toast.error("Receipt could not be printed — the sale is still complete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!saleId} onOpenChange={(o) => !o && onNewSale()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sale completed successfully</DialogTitle>
          <DialogDescription>
            {sale ? (
              <>
                Invoice No: <span className="font-medium text-foreground">{sale.invoice_no}</span> · Total:{" "}
                <span className="font-medium text-foreground">{inr(sale.grand_total)}</span>
              </>
            ) : (
              "Saving invoice…"
            )}
          </DialogDescription>
        </DialogHeader>

        {failed && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            Receipt could not be printed. The sale and inventory update remain completed — retry the print or
            reprint it later from Invoices.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {p.can("print_receipt") && (
            <Button variant="outline" disabled={!sale || busy} onClick={() => sale && void act(() => p.printReceipt(sale))}>
              {failed ? <RotateCw className="mr-1.5 size-4" /> : <Printer className="mr-1.5 size-4" />}
              {failed ? "Retry Print" : "Print Receipt"}
            </Button>
          )}
          {p.can("print_invoice") && p.a4Enabled && (
            <Button variant="outline" disabled={!sale || busy} onClick={() => sale && void act(() => p.printInvoice(sale))}>
              <FileText className="mr-1.5 size-4" /> Print A4 Invoice
            </Button>
          )}
          {p.can("download_invoice") && p.a4Enabled && (
            <Button variant="outline" disabled={!sale || busy} onClick={() => sale && void act(() => p.downloadInvoice(sale))}>
              <Download className="mr-1.5 size-4" /> Download Invoice
            </Button>
          )}
          <Button onClick={onNewSale}>
            <Plus className="mr-1.5 size-4" /> New Sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Printer test used by Business Settings — never creates a sale or stock movement. */
export function TestPrintControl() {
  const p = usePrinter();
  const [kind, setKind] = useState<PrinterType>(p.settings.receipt_printer_type);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={kind} onValueChange={(v) => setKind(v as PrinterType)}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRINTER_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          p.testPrint(kind)
            .then(() => toast.success("Test receipt sent to the printer dialog"))
            .catch(() => toast.error("Test print failed"))
            .finally(() => setBusy(false));
        }}
      >
        <Printer className="mr-1.5 size-4" /> Test Print
      </Button>
    </div>
  );
}
