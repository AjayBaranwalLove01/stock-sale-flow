import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, LoadingRows } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr, num, dateFmt } from "@/lib/format";
import {
  IndianRupee,
  ShoppingCart,
  TrendingUp,
  Package,
  FolderTree,
  Warehouse,
  AlertTriangle,
  XCircle,
  UserMinus,
  TruckIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ledger ERP" },
      { name: "description", content: "Live sales, purchases, profit and stock overview." },
      { property: "og:title", content: "Dashboard — Ledger ERP" },
      { property: "og:description", content: "Live sales, purchases, profit and stock overview." },
    ],
  }),
  component: Dashboard,
});

type RangeKey = "today" | "yesterday" | "week" | "month" | "year" | "custom";

function rangeDates(key: RangeKey, from: string, to: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  switch (key) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "week":
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "custom":
      return {
        start: from ? new Date(from + "T00:00:00") : start,
        end: to ? new Date(to + "T23:59:59") : end,
      };
  }
  return { start, end };
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom" },
];

function Dashboard() {
  const [range, setRange] = useState<RangeKey>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { start, end } = useMemo(() => rangeDates(range, from, to), [range, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range, from, to],
    queryFn: async () => {
      const [sales, purchases, products, categories, customers, suppliers] = await Promise.all([
        supabase
          .from("sales")
          .select("id,invoice_date,grand_total,cogs,taxable_amount,sale_items(product_id,product_name,quantity,total,cost_price,products(category_id))")
          .gte("invoice_date", start.toISOString())
          .lte("invoice_date", end.toISOString()),
        supabase
          .from("purchases")
          .select("id,purchase_date,grand_total")
          .gte("purchase_date", start.toISOString().slice(0, 10))
          .lte("purchase_date", end.toISOString().slice(0, 10)),
        supabase.from("products").select("id,name,current_stock,purchase_price,reorder_level,category_id"),
        supabase.from("categories").select("id,name"),
        supabase.from("customers").select("balance"),
        supabase.from("suppliers").select("balance"),
      ]);
      if (sales.error) throw sales.error;
      if (purchases.error) throw purchases.error;
      if (products.error) throw products.error;
      return {
        sales: sales.data ?? [],
        purchases: purchases.data ?? [],
        products: products.data ?? [],
        categories: categories.data ?? [],
        customers: customers.data ?? [],
        suppliers: suppliers.data ?? [],
      };
    },
  });

  const m = useMemo(() => {
    if (!data) return null;
    const salesTotal = data.sales.reduce((s, r) => s + Number(r.grand_total), 0);
    const cogs = data.sales.reduce((s, r) => s + Number(r.cogs), 0);
    const purchaseTotal = data.purchases.reduce((s, r) => s + Number(r.grand_total), 0);
    const stockValue = data.products.reduce(
      (s, p) => s + Number(p.current_stock) * Number(p.purchase_price),
      0,
    );
    const low = data.products.filter(
      (p) => Number(p.current_stock) > 0 && Number(p.current_stock) <= Number(p.reorder_level),
    ).length;
    const out = data.products.filter((p) => Number(p.current_stock) <= 0).length;

    const byDay = new Map<string, { date: string; sales: number; purchases: number; profit: number }>();
    for (const s of data.sales) {
      const k = String(s.invoice_date).slice(0, 10);
      const row = byDay.get(k) ?? { date: k, sales: 0, purchases: 0, profit: 0 };
      row.sales += Number(s.grand_total);
      row.profit += Number(s.taxable_amount) - Number(s.cogs);
      byDay.set(k, row);
    }
    for (const p of data.purchases) {
      const k = String(p.purchase_date).slice(0, 10);
      const row = byDay.get(k) ?? { date: k, sales: 0, purchases: 0, profit: 0 };
      row.purchases += Number(p.grand_total);
      byDay.set(k, row);
    }
    const series = Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, label: dateFmt(r.date).slice(0, 6) }));

    const catMap = new Map(data.categories.map((c) => [c.id, c.name]));
    const catSales = new Map<string, number>();
    const prodSales = new Map<string, { name: string; qty: number; amount: number }>();
    for (const s of data.sales) {
      for (const li of s.sale_items ?? []) {
        const cid = (li.products as { category_id: string } | null)?.category_id ?? "unknown";
        catSales.set(cid, (catSales.get(cid) ?? 0) + Number(li.total));
        const pr = prodSales.get(li.product_id) ?? { name: li.product_name, qty: 0, amount: 0 };
        pr.qty += Number(li.quantity);
        pr.amount += Number(li.total);
        prodSales.set(li.product_id, pr);
      }
    }

    return {
      salesTotal,
      purchaseTotal,
      profit: salesTotal - cogs,
      products: data.products.length,
      categories: data.categories.length,
      stockValue,
      low,
      out,
      custOut: data.customers.reduce((s, c) => s + Number(c.balance), 0),
      suppOut: data.suppliers.reduce((s, c) => s + Number(c.balance), 0),
      series,
      catSales: Array.from(catSales.entries())
        .map(([id, v]) => ({ name: catMap.get(id) ?? "Uncategorised", value: Math.round(v) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
      topProducts: Array.from(prodSales.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    };
  }, [data]);

  const chartColors = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Business performance at a glance"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={range === r.key ? "default" : "outline"}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
            {range === "custom" && (
              <>
                <Input
                  type="date"
                  className="h-9 w-[9.5rem]"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <Input
                  type="date"
                  className="h-9 w-[9.5rem]"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </>
            )}
          </div>
        }
      />

      {isLoading || !m ? (
        <LoadingRows rows={8} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Sales" value={inr(m.salesTotal)} icon={IndianRupee} tone="success" />
            <StatCard label="Purchases" value={inr(m.purchaseTotal)} icon={ShoppingCart} tone="info" />
            <StatCard label="Profit" value={inr(m.profit)} icon={TrendingUp} tone="success" />
            <StatCard label="Total Products" value={num(m.products)} icon={Package} />
            <StatCard label="Total Categories" value={num(m.categories)} icon={FolderTree} />
            <StatCard label="Stock Value" value={inr(m.stockValue)} icon={Warehouse} tone="info" />
            <StatCard label="Low Stock" value={num(m.low)} icon={AlertTriangle} tone="warning" />
            <StatCard label="Out of Stock" value={num(m.out)} icon={XCircle} tone="destructive" />
            <StatCard
              label="Customer Outstanding"
              value={inr(m.custOut)}
              icon={UserMinus}
              tone="warning"
            />
            <StatCard
              label="Supplier Outstanding"
              value={inr(m.suppOut)}
              icon={TruckIcon}
              tone="warning"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Sales & Purchases">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={m.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={60} />
                  <RTooltip formatter={(v: number) => inr(v)} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke="var(--color-chart-1)"
                    fill="var(--color-chart-1)"
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="purchases"
                    name="Purchases"
                    stroke="var(--color-chart-2)"
                    fill="var(--color-chart-2)"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Profit trend">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={m.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={60} />
                  <RTooltip formatter={(v: number) => inr(v)} />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Category-wise sales">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={m.catSales}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {m.catSales.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(v: number) => inr(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 10 products">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={m.topProducts} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RTooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="amount" name="Sales" fill="var(--color-chart-1)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pl-0">{children}</CardContent>
    </Card>
  );
}
