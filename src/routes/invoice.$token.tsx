import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Printer, Download, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { inr, dateTimeFmt } from "@/lib/format";

export const Route = createFileRoute("/invoice/$token")({
  head: () => ({
    meta: [
      { title: "Tax Invoice — View & Download" },
      { name: "description", content: "View and download your official tax invoice." },
    ],
  }),
  component: PublicInvoicePage,
});

interface PublicInvoiceData {
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  grand_total: number;
  paid_amount: number;
  status: string;
  notes?: string | null;
  items: Array<{
    id?: string;
    product_name: string;
    hsn_code?: string | null;
    quantity: number;
    rate: number;
    discount?: number;
    gst_rate: number;
    tax_amount?: number;
    taxable_amount?: number;
    total: number;
  }>;
  payments?: Array<{
    id?: string;
    amount: number;
    method: string;
    payment_date?: string;
    reference_no?: string | null;
  }>;
  business: {
    name: string;
    address?: string | null | undefined;
    phone?: string | null | undefined;
    email?: string | null | undefined;
    gstin?: string | null | undefined;
    logo_url?: string | null | undefined;
    terms?: string | null | undefined;
  };
}

function PublicInvoicePage() {
  const { token } = useParams({ from: "/invoice/$token" });
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<PublicInvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchInvoice() {
      setLoading(true);
      setError(null);
      try {
        // 1. Try public RPC first
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "get_public_invoice" as any,
          { p_access_token: token } as any,
        );

        if (!rpcErr && rpcData) {
          if (active) setInvoice(rpcData as unknown as PublicInvoiceData);
          return;
        }

        // 2. Fallback direct query by access_token or id
        const { data: saleData, error: saleErr } = await supabase
          .from("sales")
          .select(`
            *,
            sale_items (*),
            customer_payments (*)
          `)
          .or(`access_token.eq.${token},id.eq.${token}`)
          .maybeSingle();

        if (saleErr || !saleData) {
          if (active) setError("Invoice not found or link has expired.");
          return;
        }

        // Fetch business details
        const { data: bData } = await supabase
          .from("businesses")
          .select("id, name, logo_url, phone, email")
          .eq("id", saleData.business_id)
          .maybeSingle();

        const { data: sData } = await supabase
          .from("business_settings")
          .select("*")
          .eq("business_id", saleData.business_id)
          .maybeSingle();

        const formatted: PublicInvoiceData = {
          invoice_no: saleData.invoice_no,
          invoice_date: saleData.invoice_date,
          customer_name: saleData.customer_name,
          subtotal: Number(saleData.subtotal || 0),
          discount_amount: Number(saleData.discount_amount || 0),
          taxable_amount: Number(saleData.taxable_amount || 0),
          cgst: Number(saleData.cgst || 0),
          sgst: Number(saleData.sgst || 0),
          igst: Number(saleData.igst || 0),
          round_off: Number(saleData.round_off || 0),
          grand_total: Number(saleData.grand_total || 0),
          paid_amount: Number(saleData.paid_amount || 0),
          status: saleData.status || "completed",
          notes: saleData.notes,
          items: (saleData.sale_items ?? []).map((it: any) => ({
            id: it.id,
            product_name: it.product_name,
            hsn_code: it.hsn_code,
            quantity: Number(it.quantity),
            rate: Number(it.rate),
            discount: Number(it.discount || 0),
            gst_rate: Number(it.gst_rate || 0),
            tax_amount: Number(it.tax_amount || 0),
            taxable_amount: Number(it.taxable_amount || 0),
            total: Number(it.total),
          })),
          payments: (saleData.customer_payments ?? []).map((p: any) => ({
            id: p.id,
            amount: Number(p.amount),
            method: p.method,
            payment_date: p.payment_date,
            reference_no: p.reference_no,
          })),
          business: {
            name: sData?.business_name || bData?.name || "Business",
            address: sData?.address,
            phone: sData?.phone || bData?.phone,
            email: sData?.email || bData?.email,
            gstin: sData?.gstin,
            logo_url: sData?.logo_url || bData?.logo_url,
            terms: sData?.terms_conditions,
          },
        };

        if (active) setInvoice(formatted);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load invoice");
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchInvoice();
    return () => {
      active = false;
    };
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-4">
        <div className="space-y-3 text-center">
          <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Loading your invoice…</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center space-y-4">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Invoice Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            {error || "We could not find the invoice requested. Please check the link or contact the store."}
          </p>
        </Card>
      </div>
    );
  }

  const balanceDue = Math.max(0, invoice.grand_total - invoice.paid_amount);

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3 sm:px-6">
      {/* Top Action Bar (Hidden during printing) */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-background text-xs py-1 px-2.5 gap-1.5 shadow-xs">
            <CheckCircle2 className="size-3.5 text-success" />
            Verified Invoice
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 shadow-xs">
            <Printer className="size-4" />
            Print
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-1.5 shadow-xs">
            <Download className="size-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Main Printable Tax Invoice Card */}
      <Card className="max-w-3xl mx-auto p-6 sm:p-8 bg-background shadow-md border-border/80 rounded-2xl print:shadow-none print:border-none print:p-0">
        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b">
          <div className="space-y-1.5 max-w-sm">
            {invoice.business.logo_url ? (
              <img
                src={invoice.business.logo_url}
                alt={invoice.business.name}
                className="h-10 max-w-[160px] object-contain mb-2"
              />
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="size-5 text-primary" />
                <span className="text-lg font-bold tracking-tight">{invoice.business.name}</span>
              </div>
            )}
            {invoice.business.logo_url && (
              <h2 className="text-lg font-bold tracking-tight">{invoice.business.name}</h2>
            )}
            {invoice.business.address && (
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                {invoice.business.address}
              </p>
            )}
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
              {invoice.business.phone && <span>Phone: {invoice.business.phone}</span>}
              {invoice.business.email && <span>Email: {invoice.business.email}</span>}
            </div>
            {invoice.business.gstin && (
              <p className="text-xs font-medium text-foreground pt-0.5">
                GSTIN: <span className="font-mono">{invoice.business.gstin}</span>
              </p>
            )}
          </div>

          <div className="text-left sm:text-right space-y-1 shrink-0">
            <Badge variant="secondary" className="text-xs tracking-wider uppercase font-semibold px-2 py-0.5 mb-1">
              Tax Invoice
            </Badge>
            <div className="text-xl font-bold font-mono tracking-tight text-foreground">
              {invoice.invoice_no}
            </div>
            <p className="text-xs text-muted-foreground">
              Date: <span className="font-medium text-foreground">{dateTimeFmt(invoice.invoice_date)}</span>
            </p>
            <div className="pt-1">
              {balanceDue > 0 ? (
                <Badge variant="destructive" className="text-xs">
                  Due: {inr(balanceDue)}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-success/15 text-success hover:bg-success/20 text-xs">
                  Fully Paid
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Bill To Section */}
        <div className="py-4 border-b flex justify-between items-start">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Billed To
            </span>
            <div className="text-sm font-semibold text-foreground mt-0.5">
              {invoice.customer_name}
            </div>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="py-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 text-xs">#</TableHead>
                <TableHead className="text-xs">Item Description</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs text-right">Rate</TableHead>
                <TableHead className="text-xs text-right">GST</TableHead>
                <TableHead className="text-xs text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((it, idx) => (
                <TableRow key={it.id || idx}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="text-xs font-medium">
                    {it.product_name}
                    {it.hsn_code && (
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        HSN: {it.hsn_code}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{it.quantity}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{inr(it.rate)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                    {it.gst_rate}%
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-semibold">
                    {inr(it.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals Breakdown */}
        <div className="pt-3 pb-6 border-t flex flex-col sm:flex-row justify-between gap-6">
          <div className="text-xs text-muted-foreground space-y-2 max-w-sm">
            {invoice.notes && (
              <div>
                <span className="font-semibold text-foreground">Notes:</span> {invoice.notes}
              </div>
            )}
            {invoice.business.terms && (
              <div className="pt-2 border-t text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-line">
                <span className="font-semibold text-foreground block mb-0.5">Terms & Conditions:</span>
                {invoice.business.terms}
              </div>
            )}
          </div>

          <div className="w-full sm:w-64 space-y-1.5 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span>
              <span className="tabular-nums font-medium text-foreground">{inr(invoice.subtotal)}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Discount:</span>
                <span className="tabular-nums font-medium">-{inr(invoice.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Taxable Amount:</span>
              <span className="tabular-nums font-medium text-foreground">{inr(invoice.taxable_amount)}</span>
            </div>
            {invoice.cgst > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>CGST:</span>
                <span className="tabular-nums font-medium text-foreground">{inr(invoice.cgst)}</span>
              </div>
            )}
            {invoice.sgst > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>SGST:</span>
                <span className="tabular-nums font-medium text-foreground">{inr(invoice.sgst)}</span>
              </div>
            )}
            {invoice.igst > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>IGST:</span>
                <span className="tabular-nums font-medium text-foreground">{inr(invoice.igst)}</span>
              </div>
            )}
            {invoice.round_off !== 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Round off:</span>
                <span className="tabular-nums font-medium text-foreground">{inr(invoice.round_off)}</span>
              </div>
            )}
            <Separator className="my-1.5" />
            <div className="flex justify-between text-sm font-bold text-foreground">
              <span>Grand Total:</span>
              <span className="tabular-nums">{inr(invoice.grand_total)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Amount Paid:</span>
              <span className="tabular-nums font-medium text-success">{inr(invoice.paid_amount)}</span>
            </div>
            {balanceDue > 0 && (
              <div className="flex justify-between text-sm font-semibold text-destructive pt-1">
                <span>Balance Due:</span>
                <span className="tabular-nums">{inr(balanceDue)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t text-center text-xs text-muted-foreground">
          Thank you for your business!
        </div>
      </Card>
    </div>
  );
}
