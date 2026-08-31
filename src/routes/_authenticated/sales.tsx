import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Trash2, Plus, Minus, Printer, Receipt, ScanLine, Camera } from "lucide-react";
import { useCategories, useCustomers, useProducts, useSales, useSettings } from "@/lib/queries";
import { inr, dateTimeFmt, PAYMENT_METHODS } from "@/lib/format";
import { Thumb } from "@/components/ImagePicker";
import { BarcodeInput, BarcodeScannerDialog } from "@/components/BarcodeScanner";
import { lookupBarcode, logBarcodeAudit, useBarcode } from "@/lib/barcode";
import { Link } from "@tanstack/react-router";
import { PostSaleDialog, ReceiptActions } from "@/components/ReceiptPrint";


export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales & Billing — Ledger ERP" },
      { name: "description", content: "POS-style GST billing with instant invoice generation and printing." },
      { property: "og:title", content: "Sales & Billing — Ledger ERP" },
      { property: "og:description", content: "POS-style GST billing with instant invoice generation and printing." },
    ],
  }),
  component: SalesPage,
});

type Product = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  category_id: string;
  selling_price: number;
  gst_rate: number;
  current_stock: number;
  unit: string;
  image_md?: string | null;
};


type Line = {
  product_id: string;
  name: string;
  rate: number;
  quantity: number;
  discount: number;
  gst_rate: number;
  stock: number;
};

function SalesPage() {
  return (
    <div>
      <PageHeader title="Sales & Billing" description="Fast POS billing with GST, multi-payment and invoice printing." />
      <Tabs defaultValue="pos">
        <TabsList>
          <TabsTrigger value="pos">New Sale (POS)</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="pos" className="mt-4">
          <Pos />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <Invoices />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Pos() {
  const qc = useQueryClient();
  const { data: products, isLoading } = useProducts();
  const { data: categories } = useCategories();
  const { data: customers } = useCustomers();
  const { data: settings } = useSettings();
  const list = (products ?? []) as unknown as Product[];

  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("walkin");
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const [method, setMethod] = useState<string>("cash");
  const [paid, setPaid] = useState("");
  const [notes, setNotes] = useState("");
  const barcode = useBarcode();
  const [camera, setCamera] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const scannedCodes = useRef<string[]>([]);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      list.filter(
        (p) =>
          (cat === "all" || p.category_id === cat) &&
          [p.name, p.sku, p.barcode].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [list, cat, q],
  );

  function add(p: Product) {
    if (Number(p.current_stock) <= 0) {
      toast.error(`Out of stock — ${p.name}`);
      return;
    }
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product_id === p.id);
      if (i >= 0) {
        const line = prev[i]!;
        if (line.quantity + 1 > Number(p.current_stock)) {
          toast.error("Insufficient stock", {
            description: `${p.name} — available ${Number(p.current_stock)}, requested ${line.quantity + 1}`,
          });
          return prev;
        }
        const next = [...prev];
        next[i] = { ...line, quantity: line.quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          rate: Number(p.selling_price),
          quantity: 1,
          discount: 0,
          gst_rate: Number(p.gst_rate),
          stock: Number(p.current_stock),
        },
      ];
    });
  }

  /** Barcode scan: find product in this business, add to cart, keep the field ready. */
  async function handleScan(code: string) {
    setNotFound(null);
    try {
      const p = await lookupBarcode(code);
      if (!p) {
        setScanMsg(null);
        setNotFound(code);
        toast.error(`Product not found for ${code}`);
        return;
      }
      if (p.status !== "active") {
        toast.error(`${p.name} is not available for sale`);
        return;
      }
      add({
        id: p.id,
        sku: p.sku,
        name: p.name,
        barcode: p.barcode,
        category_id: p.category_id,
        selling_price: Number(p.selling_price),
        gst_rate: Number(p.gst_rate),
        current_stock: Number(p.current_stock),
        unit: p.unit,
      });
      scannedCodes.current = Array.from(new Set([...scannedCodes.current, p.barcode]));
      setScanMsg(`${p.name} added · stock ${p.current_stock} ${p.unit}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that barcode");
    }
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const totals = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    for (const l of lines) {
      const base = l.quantity * l.rate - l.discount;
      const t = base;
      const gst = Math.round(((t * l.gst_rate) / 100) * 100) / 100;
      taxable += t;
      tax += gst;
    }
    taxable -= Number(invoiceDiscount || 0);
    const grand = Math.round(taxable + tax);
    return { taxable, tax, grand, roundOff: grand - (taxable + tax) };
  }, [lines, invoiceDiscount]);

  const create = useMutation({
    mutationFn: async () => {
      if (!lines.length) throw new Error("Add at least one product");
      const payAmount = paid === "" ? totals.grand : Number(paid);
      const { data, error } = await supabase.rpc("create_sale", {
        p_customer_id: customerId === "walkin" ? (null as unknown as string) : customerId,
        p_customer_name:
          customerId === "walkin"
            ? "Walk-in Customer"
            : ((customers ?? []) as { id: string; name: string }[]).find((c) => c.id === customerId)?.name ??
              "Walk-in Customer",
        p_items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          rate: l.rate,
          discount: l.discount,
          gst_rate: l.gst_rate,
        })),
        p_invoice_discount: Number(invoiceDiscount || 0),
        p_payments: payAmount > 0 ? [{ amount: payAmount, method }] : [],
        p_notes: notes || "",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (saleId: string) => {
      toast.success("Invoice created");
      setLastSaleId(saleId);
      if (scannedCodes.current.length) {
        void logBarcodeAudit("Sale Completed Using Barcode", undefined, scannedCodes.current.join(", "));
        scannedCodes.current = [];
      }
      setLines([]);
      setInvoiceDiscount("0");
      setPaid("");
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="overflow-hidden">
        {barcode.can("barcode_sales") && (
          <div className="space-y-2 border-b bg-muted/40 p-3">
            <Label htmlFor="pos-scan" className="flex items-center gap-1.5 text-xs">
              <ScanLine className="size-3.5" /> Barcode — scan to add, stays focused for the next item
            </Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <BarcodeInput onScan={(c) => void handleScan(c)} placeholder="Scan / enter barcode" />
              </div>
              <Button type="button" variant="outline" onClick={() => setCamera(true)}>
                <Camera className="mr-1.5 size-4" /> Camera
              </Button>
            </div>
            {scanMsg && <p className="text-xs text-success">{scanMsg}</p>}
            {notFound && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                <span className="font-medium">Product not found for {notFound}</span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/products">Add new product</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setQ(notFound); setNotFound(null); }}>
                  Search product
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNotFound(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Scan barcode or search product…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  add(filtered[0]);
                  setQ("");
                }
              }}
            />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState title="No products" description="Try a different search or category." />
        ) : (
          <ScrollArea className="h-[520px]">
            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className="rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm"
                >
                  <Thumb path={p.image_md} alt={p.name} className="mb-2 h-20 w-full" />
                  <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{p.sku}</p>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="tabular text-sm font-semibold">{inr(p.selling_price)}</span>
                    <Badge variant={Number(p.current_stock) > 0 ? "secondary" : "destructive"} className="text-[10px]">
                      {Number(p.current_stock)} {p.unit}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      <Card className="flex flex-col p-3">
        <div className="space-y-2">
          <Label>Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="walkin">Walk-in Customer</SelectItem>
              {((customers ?? []) as { id: string; name: string }[]).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-3" />

        <ScrollArea className="max-h-[260px] flex-1">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cart is empty</p>
          ) : (
            <div className="space-y-2 pr-2">
              {lines.map((l, i) => (
                <div key={l.product_id} className="rounded-md border p-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{l.name}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => setLine(i, { quantity: Math.max(1, l.quantity - 1) })}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      className="h-7 w-14 text-center"
                      value={l.quantity}
                      onChange={(e) => {
                        const qty = Number(e.target.value) || 0;
                        if (qty > l.stock) {
                          toast.error("Insufficient stock", {
                            description: `${l.name} — available ${l.stock}, requested ${qty}`,
                          });
                          return;
                        }
                        setLine(i, { quantity: qty });
                      }}
                    />
                    <Button variant="outline" size="icon" className="size-7" onClick={() =>
                        l.quantity + 1 > l.stock
                          ? toast.error("Insufficient stock", {
                              description: `${l.name} — available ${l.stock}`,
                            })
                          : setLine(i, { quantity: l.quantity + 1 })
                      }>
                      <Plus className="size-3" />
                    </Button>
                    <Input
                      className="h-7 flex-1"
                      value={l.rate}
                      onChange={(e) => setLine(i, { rate: Number(e.target.value) || 0 })}
                    />
                    <span className="tabular w-20 text-right text-sm font-medium">
                      {inr(l.quantity * l.rate - l.discount)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">GST {l.gst_rate}% · Stock {l.stock}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator className="my-3" />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Taxable</span>
            <span className="tabular">{inr(totals.taxable)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">CGST + SGST</span>
            <span className="tabular">{inr(totals.tax)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Invoice discount</span>
            <Input
              className="h-7 w-24 text-right"
              type="number"
              value={invoiceDiscount}
              onChange={(e) => setInvoiceDiscount(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Round off</span>
            <span className="tabular">{inr(totals.roundOff)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Grand Total</span>
            <span className="tabular">{inr(totals.grand)}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder={`Paid (${totals.grand})`}
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
          />
        </div>
        <Input className="mt-2" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <Button className="mt-3" disabled={create.isPending || !lines.length} onClick={() => create.mutate()}>
          <Receipt className="mr-1.5 size-4" />
          {create.isPending ? "Saving…" : `Complete Sale · ${inr(totals.grand)}`}
        </Button>
        {settings?.allow_negative_stock === false && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Negative stock is blocked in settings</p>
        )}
      </Card>

      <PostSaleDialog saleId={lastSaleId} onNewSale={() => setLastSaleId(null)} />

      <BarcodeScannerDialog
        open={camera}
        onOpenChange={setCamera}
        onDetected={(c) => void handleScan(c)}
        title="Scan product to sell"
      />
    </div>
  );
}

type SaleRow = {
  id: string;
  invoice_no: string;
  customer_name: string;
  invoice_date: string;
  grand_total: number;
  paid_amount: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  round_off: number;
  status: string;
  sale_items: {
    id: string;
    product_name: string;
    quantity: number;
    rate: number;
    gst_rate: number;
    total: number;
  }[];
};

function Invoices() {
  const { data, isLoading } = useSales();
  const rows = (data ?? []) as unknown as SaleRow[];
  const [q, setQ] = useState("");
  const [view, setView] = useState<SaleRow | null>(null);
  const { data: settings } = useSettings();

  const filtered = rows.filter((r) =>
    [r.invoice_no, r.customer_name].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search invoice or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : filtered.length === 0 ? (
        <EmptyState title="No invoices yet" description="Create your first sale from the POS tab." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.invoice_no}</TableCell>
                  <TableCell className="text-sm">{dateTimeFmt(r.invoice_date)}</TableCell>
                  <TableCell className="text-sm">{r.customer_name}</TableCell>
                  <TableCell className="tabular text-right">{inr(r.grand_total)}</TableCell>
                  <TableCell className="tabular text-right">{inr(r.paid_amount)}</TableCell>
                  <TableCell className="tabular text-right">
                    {Number(r.grand_total) - Number(r.paid_amount) > 0 ? (
                      <Badge variant="destructive">{inr(Number(r.grand_total) - Number(r.paid_amount))}</Badge>
                    ) : (
                      <Badge variant="secondary">Paid</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setView(r)}>
                        View
                      </Button>
                      <ReceiptActions saleId={r.id} reprint />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice {view?.invoice_no}</DialogTitle>
          </DialogHeader>
          {view && (
            <div id="invoice-print" className="space-y-3 text-sm">
              <div className="flex justify-between">
                <div>
                  <p className="text-base font-semibold">{settings?.business_name ?? "Business"}</p>
                  <p className="text-xs text-muted-foreground">{settings?.address}</p>
                  <p className="text-xs text-muted-foreground">GSTIN: {settings?.gstin ?? "—"}</p>
                </div>
                <div className="text-right text-xs">
                  <p>{dateTimeFmt(view.invoice_date)}</p>
                  <p>{view.customer_name}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.sale_items?.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{it.product_name}</TableCell>
                      <TableCell className="tabular text-right">{it.quantity}</TableCell>
                      <TableCell className="tabular text-right">{inr(it.rate)}</TableCell>
                      <TableCell className="tabular text-right">{it.gst_rate}%</TableCell>
                      <TableCell className="tabular text-right">{inr(it.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="ml-auto w-56 space-y-1">
                <Row label="Taxable" value={inr(view.taxable_amount)} />
                <Row label="CGST" value={inr(view.cgst)} />
                <Row label="SGST" value={inr(view.sgst)} />
                <Row label="Round off" value={inr(view.round_off)} />
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Grand Total</span>
                  <span className="tabular">{inr(view.grand_total)}</span>
                </div>
              </div>
              {settings?.terms_conditions && (
                <p className="text-[11px] text-muted-foreground">{settings.terms_conditions}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1.5 size-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
