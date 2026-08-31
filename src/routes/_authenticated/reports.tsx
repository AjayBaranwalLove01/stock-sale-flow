import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, LoadingRows, StatCard, EmptyState } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, TrendingUp, Package, IndianRupee, Percent } from "lucide-react";
import { inr, num, dateFmt, downloadCsv } from "@/lib/format";
import { useProducts } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Ledger ERP" },
      { name: "description", content: "Sales, purchase, GST, stock and profitability reports with CSV export." },
      { property: "og:title", content: "Reports — Ledger ERP" },
      { property: "og:description", content: "Sales, purchase, GST, stock and profitability reports with CSV export." },
    ],
  }),
  component: ReportsPage,
});

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function ReportsPage() {
  const today = new Date();
  const start = new Date(today.getTime() - 29 * 864e5);
  const [from, setFrom] = useState(iso(start));
  const [to, setTo] = useState(iso(today));

  const range = { from, to: `${to}T23:59:59` };

  const { data: sales, isLoading: sLoading } = useQuery({
    queryKey: ["report-sales", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,invoice_date,customer_name,taxable_amount,cgst,sgst,igst,grand_total,paid_amount,cogs")
        .gte("invoice_date", range.from)
        .lte("invoice_date", range.to)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases, isLoading: pLoading } = useQuery({
    queryKey: ["report-purchases", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,purchase_no,purchase_date,grand_total,tax_amount,paid_amount,suppliers(name)")
        .gte("purchase_date", from)
        .lte("purchase_date", to)
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useProducts();
  const stock = (products ?? []) as unknown as {
    id: string;
    name: string;
    sku: string;
    current_stock: number;
    min_stock: number;
    purchase_price: number;
    selling_price: number;
    unit: string;
    expiry_date: string | null;
  }[];

  const s = sales ?? [];
  const p = purchases ?? [];

  const summary = useMemo(() => {
    const revenue = s.reduce((a, r) => a + Number(r.grand_total || 0), 0);
    const cogs = s.reduce((a, r) => a + Number(r.cogs || 0), 0);
    const tax = s.reduce((a, r) => a + Number(r.cgst || 0) + Number(r.sgst || 0) + Number(r.igst || 0), 0);
    const purchase = p.reduce((a, r) => a + Number(r.grand_total || 0), 0);
    return { revenue, cogs, profit: revenue - cogs, tax, purchase };
  }, [s, p]);

  const stockValue = stock.reduce((a, r) => a + Number(r.current_stock) * Number(r.purchase_price), 0);
  const lowStock = stock.filter((r) => Number(r.current_stock) <= Number(r.min_stock));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Financial and inventory insights for the selected period."
        actions={
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Revenue" value={inr(summary.revenue)} icon={IndianRupee} tone="success" />
        <StatCard label="COGS" value={inr(summary.cogs)} icon={Package} />
        <StatCard label="Gross Profit" value={inr(summary.profit)} icon={TrendingUp} tone="info" />
        <StatCard label="GST Collected" value={inr(summary.tax)} icon={Percent} tone="warning" />
        <StatCard label="Stock Value" value={inr(stockValue)} icon={Package} />
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="gst">GST Summary</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <Card>
            <Head
              title="Sales register"
              onExport={() =>
                downloadCsv(
                  "sales-report.csv",
                  s.map((r) => ({
                    Invoice: r.invoice_no,
                    Date: r.invoice_date,
                    Customer: r.customer_name,
                    Taxable: r.taxable_amount,
                    GST: Number(r.cgst) + Number(r.sgst) + Number(r.igst),
                    Total: r.grand_total,
                    Paid: r.paid_amount,
                    Profit: Number(r.grand_total) - Number(r.cogs),
                  })),
                )
              }
            />
            {sLoading ? (
              <LoadingRows />
            ) : s.length === 0 ? (
              <EmptyState title="No sales in this period" />
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.invoice_no}</TableCell>
                        <TableCell className="text-sm">{dateFmt(r.invoice_date)}</TableCell>
                        <TableCell className="text-sm">{r.customer_name}</TableCell>
                        <TableCell className="tabular text-right">{inr(r.taxable_amount)}</TableCell>
                        <TableCell className="tabular text-right">
                          {inr(Number(r.cgst) + Number(r.sgst) + Number(r.igst))}
                        </TableCell>
                        <TableCell className="tabular text-right">{inr(r.grand_total)}</TableCell>
                        <TableCell className="tabular text-right text-success">
                          {inr(Number(r.grand_total) - Number(r.cogs))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="purchases" className="mt-4">
          <Card>
            <Head
              title="Purchase register"
              onExport={() =>
                downloadCsv(
                  "purchase-report.csv",
                  p.map((r) => ({
                    Purchase: r.purchase_no,
                    Date: r.purchase_date,
                    Supplier: (r.suppliers as { name: string } | null)?.name ?? "",
                    Tax: r.tax_amount,
                    Total: r.grand_total,
                    Paid: r.paid_amount,
                  })),
                )
              }
            />
            {pLoading ? (
              <LoadingRows />
            ) : p.length === 0 ? (
              <EmptyState title="No purchases in this period" />
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Purchase</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.purchase_no}</TableCell>
                        <TableCell className="text-sm">{dateFmt(r.purchase_date)}</TableCell>
                        <TableCell className="text-sm">{(r.suppliers as { name: string } | null)?.name ?? "—"}</TableCell>
                        <TableCell className="tabular text-right">{inr(r.tax_amount)}</TableCell>
                        <TableCell className="tabular text-right">{inr(r.grand_total)}</TableCell>
                        <TableCell className="tabular text-right">{inr(r.paid_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="gst" className="mt-4">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold">GST summary ({dateFmt(from)} – {dateFmt(to)})</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Output CGST" value={inr(s.reduce((a, r) => a + Number(r.cgst || 0), 0))} />
              <StatCard label="Output SGST" value={inr(s.reduce((a, r) => a + Number(r.sgst || 0), 0))} />
              <StatCard label="Output IGST" value={inr(s.reduce((a, r) => a + Number(r.igst || 0), 0))} />
              <StatCard
                label="Input Tax (Purchases)"
                value={inr(p.reduce((a, r) => a + Number(r.tax_amount || 0), 0))}
              />
            </div>
            <div className="mt-4 rounded-md border p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Net GST payable</span>
                <span className="tabular text-lg font-semibold">
                  {inr(summary.tax - p.reduce((a, r) => a + Number(r.tax_amount || 0), 0))}
                </span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <Card>
            <Head
              title={`Stock report · ${lowStock.length} low-stock items`}
              onExport={() =>
                downloadCsv(
                  "stock-report.csv",
                  stock.map((r) => ({
                    SKU: r.sku,
                    Product: r.name,
                    Stock: r.current_stock,
                    Unit: r.unit,
                    MinStock: r.min_stock,
                    CostValue: Number(r.current_stock) * Number(r.purchase_price),
                    Expiry: r.expiry_date ?? "",
                  })),
                )
              }
            />
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Cost Value</TableHead>
                    <TableHead>Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.sku}</TableCell>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell
                        className={`tabular text-right ${Number(r.current_stock) <= Number(r.min_stock) ? "font-semibold text-destructive" : ""}`}
                      >
                        {num(r.current_stock)} {r.unit}
                      </TableCell>
                      <TableCell className="tabular text-right">{num(r.min_stock)}</TableCell>
                      <TableCell className="tabular text-right">
                        {inr(Number(r.current_stock) * Number(r.purchase_price))}
                      </TableCell>
                      <TableCell className="text-sm">{r.expiry_date ? dateFmt(r.expiry_date) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Head({ title, onExport }: { title: string; onExport: () => void }) {
  return (
    <div className="flex items-center justify-between border-b p-3">
      <p className="text-sm font-medium">{title}</p>
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="mr-1.5 size-4" /> Export CSV
      </Button>
    </div>
  );
}
