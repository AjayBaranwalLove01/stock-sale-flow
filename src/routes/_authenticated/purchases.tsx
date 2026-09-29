import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { LocationSelector } from "@/components/LocationSelector";
import {
  Plus,
  Search,
  Trash2,
  ShoppingCart,
  Wallet,
  Paperclip,
  Upload,
  FileText,
  ExternalLink,
  Download,
  Image as ImageIcon,
  X,
  Loader2,
} from "lucide-react";
import { usePurchases, useProducts, useSuppliers } from "@/lib/queries";
import { useActiveBusiness } from "@/hooks/useTenant";
import { inr, dateFmt, dateTimeFmt } from "@/lib/format";
import {
  uploadPurchaseReceipt,
  parsePurchaseNotes,
  formatPurchaseNotes,
  updatePurchaseReceiptRecord,
  downloadReceipt,
  getPurchaseReceiptUrl,
  type PurchaseReceiptMeta,
} from "@/lib/purchase-receipts";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — Ledger ERP" },
      { name: "description", content: "Record supplier purchases, update stock and track payables." },
      { property: "og:title", content: "Purchases — Ledger ERP" },
      { property: "og:description", content: "Record supplier purchases, update stock and track payables." },
    ],
  }),
  component: PurchasesPage,
});

type Product = { id: string; name: string; sku: string; purchase_price: number; gst_rate: number };
type PLine = { product_id: string; name: string; quantity: number; rate: number; discount: number; gst_rate: number };

type PurchaseRow = {
  id: string;
  business_id: string;
  purchase_no: string;
  purchase_date: string;
  due_date: string | null;
  grand_total: number;
  paid_amount: number;
  tax_amount: number;
  notes: string | null;
  suppliers: { name: string } | null;
  purchase_items: { id: string; quantity: number; rate: number; total: number; products: { name: string; sku: string } | null }[];
};

function PurchasesPage() {
  const qc = useQueryClient();
  const { data: activeBiz } = useActiveBusiness();
  const { data, isLoading } = usePurchases();
  const rows = (data ?? []) as unknown as PurchaseRow[];
  const { data: suppliers } = useSuppliers();
  const { data: products } = useProducts();
  const plist = (products ?? []) as unknown as Product[];

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PurchaseRow | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paid, setPaid] = useState("0");
  const [notes, setNotes] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

  const [lines, setLines] = useState<PLine[]>([]);
  const [pick, setPick] = useState("");

  const filtered = rows.filter((r) =>
    [r.purchase_no, r.suppliers?.name].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  const totals = useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
      const base = l.quantity * l.rate - l.discount;
      sub += base;
      tax += Math.round(((base * l.gst_rate) / 100) * 100) / 100;
    }
    return { sub, tax, grand: Math.round((sub + tax) * 100) / 100 };
  }, [lines]);

  function addProduct(id: string) {
    const p = plist.find((x) => x.id === id);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.product_id === id)
        ? prev
        : [
            ...prev,
            {
              product_id: p.id,
              name: p.name,
              quantity: 1,
              rate: Number(p.purchase_price || 0),
              discount: 0,
              gst_rate: Number(p.gst_rate || 0),
            },
          ],
    );
    setPick("");
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("Select a supplier");
      if (!lines.length) throw new Error("Add at least one item");

      let finalNotes = notes || "";
      if (receiptFile) {
        setIsUploadingReceipt(true);
        try {
          const bid = activeBiz?.id || "biz";
          const meta = await uploadPurchaseReceipt(receiptFile, bid);
          finalNotes = formatPurchaseNotes(notes, meta);
        } finally {
          setIsUploadingReceipt(false);
        }
      }

      const { error } = await supabase.rpc("create_purchase", {
        p_supplier_id: supplierId,
        p_purchase_date: purchaseDate,
        p_due_date: dueDate || (null as unknown as string),
        p_items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          rate: l.rate,
          discount: l.discount,
          gst_rate: l.gst_rate,
        })),
        p_paid_amount: Number(paid || 0),
        p_notes: finalNotes,
        ...(warehouseId ? { p_warehouse_id: warehouseId } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase recorded");
      setOpen(false);
      setLines([]);
      setPaid("0");
      setNotes("");
      setReceiptFile(null);
      void qc.invalidateQueries({ queryKey: ["purchases"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalPurchase = rows.reduce((s, r) => s + Number(r.grand_total || 0), 0);
  const totalDue = rows.reduce((s, r) => s + (Number(r.grand_total || 0) - Number(r.paid_amount || 0)), 0);

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Goods receipt entries that add stock to the inventory ledger."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 size-4" /> New Purchase
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Purchase Orders" value={rows.length} icon={ShoppingCart} />
        <StatCard label="Total Purchased" value={inr(totalPurchase)} icon={ShoppingCart} tone="info" />
        <StatCard label="Outstanding Payable" value={inr(totalDue)} icon={Wallet} tone="warning" />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search purchase or supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState title="No purchases yet" description="Record a purchase to add stock." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-center">Receipt</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.purchase_no}</TableCell>
                    <TableCell className="text-sm">{dateFmt(r.purchase_date)}</TableCell>
                    <TableCell className="text-sm">{r.suppliers?.name ?? "—"}</TableCell>
                    <TableCell className="tabular text-right">{r.purchase_items?.length ?? 0}</TableCell>
                    <TableCell className="tabular text-right">{inr(r.grand_total)}</TableCell>
                    <TableCell className="text-right">
                      {Number(r.grand_total) - Number(r.paid_amount) > 0 ? (
                        <Badge variant="destructive">{inr(Number(r.grand_total) - Number(r.paid_amount))}</Badge>
                      ) : (
                        <Badge variant="secondary">Paid</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const { receipt } = parsePurchaseNotes(r.notes);
                        if (!receipt) return <span className="text-xs text-muted-foreground">—</span>;
                        return (
                          <Badge
                            variant="secondary"
                            className="cursor-pointer gap-1 text-[11px] font-normal hover:bg-secondary/80"
                            onClick={() => setView(r)}
                            title={`${receipt.fileName} (Click to view)`}
                          >
                            <Paperclip className="size-3 text-primary" />
                            <span>{receipt.fileType === "pdf" ? "PDF" : "Image"}</span>
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setView(r)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Purchase</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {((suppliers ?? []) as { id: string; name: string }[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <LocationSelector
              label="Receiving Location"
              value={warehouseId}
              onChange={setWarehouseId}
            />
          </div>


          <div>
            <Label>Add Product</Label>
            <Select value={pick} onValueChange={addProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Search and add a product" />
              </SelectTrigger>
              <SelectContent>
                {plist.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[280px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28">Rate</TableHead>
                  <TableHead className="w-24">Disc</TableHead>
                  <TableHead className="w-24">GST %</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No items added
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((l, i) => {
                    const base = l.quantity * l.rate - l.discount;
                    return (
                      <TableRow key={l.product_id}>
                        <TableCell className="text-sm">{l.name}</TableCell>
                        {(["quantity", "rate", "discount", "gst_rate"] as const).map((k) => (
                          <TableCell key={k}>
                            <Input
                              className="h-8"
                              type="number"
                              value={l[k]}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((x, idx) => (idx === i ? { ...x, [k]: Number(e.target.value) || 0 } : x)),
                                )
                              }
                            />
                          </TableCell>
                        ))}
                        <TableCell className="tabular text-right">{inr(base + (base * l.gst_rate) / 100)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Notes</Label>
                <Input
                  placeholder="Optional purchase remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <Label>Purchase Receipt / Invoice</Label>
                <div className="mt-1 flex items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-2 border border-input rounded-md text-xs font-medium bg-background hover:bg-muted cursor-pointer transition-colors">
                    <Upload className="size-3.5 text-primary" />
                    <span>{receiptFile ? "Change Receipt" : "Upload Receipt"}</span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (f.size > 15 * 1024 * 1024) {
                            toast.error("Receipt file cannot exceed 15MB");
                            return;
                          }
                          setReceiptFile(f);
                        }
                      }}
                    />
                  </label>
                  {receiptFile && (
                    <div className="flex items-center gap-1.5 text-xs bg-muted/80 px-2.5 py-1 rounded-md border">
                      <Paperclip className="size-3.5 text-muted-foreground" />
                      <span className="font-medium max-w-[140px] truncate">{receiptFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-4 p-0 ml-1 hover:text-destructive"
                        onClick={() => setReceiptFile(null)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Supported formats: PDF, JPG, PNG (up to 15MB)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t">
              <div>
                <Label>Paid Amount</Label>
                <Input type="number" className="w-36" value={paid} onChange={(e) => setPaid(e.target.value)} />
              </div>
              <div className="w-52 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular">{inr(totals.sub)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="tabular">{inr(totals.tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Grand Total</span>
                  <span className="tabular">{inr(totals.grand)}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || isUploadingReceipt}>
              {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {view && (() => {
            const { userNotes, receipt } = parsePurchaseNotes(view.notes);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="text-xl">{view.purchase_no}</DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Supplier: <span className="font-medium text-foreground">{view.suppliers?.name ?? "—"}</span> · Date: {dateFmt(view.purchase_date)}
                      </p>
                    </div>
                    {Number(view.grand_total) - Number(view.paid_amount) > 0 ? (
                      <Badge variant="destructive">
                        Due: {inr(Number(view.grand_total) - Number(view.paid_amount))}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Paid in Full</Badge>
                    )}
                  </div>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {view.purchase_items?.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{it.products?.name ?? "—"}</div>
                              {it.products?.sku && (
                                <div className="text-xs text-muted-foreground">{it.products.sku}</div>
                              )}
                            </TableCell>
                            <TableCell className="tabular text-right">{it.quantity}</TableCell>
                            <TableCell className="tabular text-right">{inr(it.rate)}</TableCell>
                            <TableCell className="tabular text-right">{inr(it.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-between items-center px-3 py-1.5 text-sm bg-muted/40 rounded-lg">
                    <span className="text-muted-foreground">Grand Total:</span>
                    <span className="font-bold text-base">{inr(view.grand_total)}</span>
                  </div>

                  {userNotes && (
                    <div className="p-3 bg-muted/30 rounded-lg text-sm">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Notes:</span>
                      <p className="text-foreground whitespace-pre-wrap">{userNotes}</p>
                    </div>
                  )}

                  {/* Attached Purchase Receipt Section */}
                  <div className="p-3 border rounded-lg bg-card space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-medium text-sm">
                        <Paperclip className="size-4 text-primary" />
                        <span>Purchase Receipt / Invoice</span>
                      </div>
                      {receipt && (
                        <Badge variant="outline" className="text-xs font-normal">
                          {receipt.fileType === "pdf" ? "PDF Document" : "Image File"}
                        </Badge>
                      )}
                    </div>

                    {receipt ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-md">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded bg-background border text-primary">
                            {receipt.fileType === "pdf" ? (
                              <FileText className="size-5" />
                            ) : (
                              <ImageIcon className="size-5" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm max-w-[280px] truncate" title={receipt.fileName}>
                              {receipt.fileName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {receipt.fileSize ? `${Math.round(receipt.fileSize / 1024)} KB · ` : ""}
                              Uploaded {receipt.uploadedAt ? dateTimeFmt(receipt.uploadedAt) : "recently"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const url = await getPurchaseReceiptUrl(receipt.path);
                                window.open(url, "_blank");
                              } catch (err: unknown) {
                                const e = err as Error;
                                toast.error(e.message || "Failed to open receipt");
                              }
                            }}
                          >
                            <ExternalLink className="mr-1.5 size-3.5" /> View
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await downloadReceipt(receipt.path, receipt.fileName);
                              } catch (err: unknown) {
                                const e = err as Error;
                                toast.error(e.message || "Failed to download receipt");
                              }
                            }}
                          >
                            <Download className="mr-1.5 size-3.5" /> Download
                          </Button>
                          <label className="inline-flex">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isUploadingReceipt}
                              asChild
                            >
                              <span>
                                {isUploadingReceipt ? (
                                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                ) : (
                                  <Upload className="mr-1.5 size-3.5" />
                                )}
                                Replace
                              </span>
                            </Button>
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f || !view) return;
                                if (f.size > 15 * 1024 * 1024) {
                                  toast.error("File size cannot exceed 15MB");
                                  return;
                                }
                                setIsUploadingReceipt(true);
                                try {
                                  const bid = activeBiz?.id || view.business_id || "biz";
                                  const newMeta = await uploadPurchaseReceipt(f, bid);
                                  const updatedNotes = await updatePurchaseReceiptRecord(
                                    view.id,
                                    newMeta,
                                    view.notes,
                                  );
                                  setView({ ...view, notes: updatedNotes });
                                  void qc.invalidateQueries({ queryKey: ["purchases"] });
                                  toast.success("Receipt replaced successfully");
                                } catch (err: unknown) {
                                  const e = err as Error;
                                  toast.error(e.message || "Failed to replace receipt");
                                } finally {
                                  setIsUploadingReceipt(false);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-3 border border-dashed rounded-md bg-muted/20">
                        <div className="text-xs text-muted-foreground">
                          No receipt attached to this purchase.
                        </div>
                        <label className="inline-flex">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUploadingReceipt}
                            asChild
                          >
                            <span>
                              {isUploadingReceipt ? (
                                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              ) : (
                                <Upload className="mr-1.5 size-3.5" />
                              )}
                              Attach Receipt
                            </span>
                          </Button>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f || !view) return;
                              if (f.size > 15 * 1024 * 1024) {
                                toast.error("File size cannot exceed 15MB");
                                return;
                              }
                              setIsUploadingReceipt(true);
                              try {
                                const bid = activeBiz?.id || view.business_id || "biz";
                                const newMeta = await uploadPurchaseReceipt(f, bid);
                                const updatedNotes = await updatePurchaseReceiptRecord(
                                  view.id,
                                  newMeta,
                                  view.notes,
                                );
                                setView({ ...view, notes: updatedNotes });
                                void qc.invalidateQueries({ queryKey: ["purchases"] });
                                toast.success("Receipt attached successfully");
                              } catch (err: unknown) {
                                const e = err as Error;
                                toast.error(e.message || "Failed to attach receipt");
                              } finally {
                                setIsUploadingReceipt(false);
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
