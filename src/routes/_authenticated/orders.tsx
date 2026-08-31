import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Search, ShoppingBag, Truck, IndianRupee } from "lucide-react";
import { inr, dateTimeFmt } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "Online Orders — Stock Keeper" },
      { name: "description", content: "Track, fulfil and cancel orders placed on the customer storefront." },
      { property: "og:title", content: "Online Orders — Stock Keeper" },
      {
        property: "og:description",
        content: "Track, fulfil and cancel orders placed on the customer storefront.",
      },
    ],
  }),
  component: OrdersPage,
});

const STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"] as const;

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  rate: number;
  total: number;
};

type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  status: (typeof STATUSES)[number];
  grand_total: number;
  created_at: string;
  order_items: OrderItem[];
};

function OrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Order | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Order[];
    },
  });

  const rows = data ?? [];
  const filtered = useMemo(
    () =>
      rows.filter((o) =>
        [o.order_no, o.customer_name, o.customer_phone, o.status].some((v) =>
          (v ?? "").toLowerCase().includes(search.toLowerCase()),
        ),
      ),
    [rows, search],
  );

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.rpc("set_order_status", { p_order_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Order updated");
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the order"),
  });

  const open = rows.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
  const revenue = rows
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.grand_total || 0), 0);

  return (
    <div>
      <PageHeader title="Online orders" description="Orders placed by customers on your storefront." />

      <div className="grid gap-3 pb-5 sm:grid-cols-3">
        <StatCard label="Total orders" value={rows.length} icon={ShoppingBag} />
        <StatCard label="Awaiting fulfilment" value={open} icon={Truck} tone="warning" />
        <StatCard label="Order value" value={inr(revenue)} icon={IndianRupee} tone="success" />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b p-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders…"
            className="h-9 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Orders placed on the customer storefront appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-44">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetail(o)}>
                  <TableCell className="font-medium">{o.order_no}</TableCell>
                  <TableCell>
                    <p className="text-sm">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{o.customer_phone ?? o.customer_email ?? "—"}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{dateTimeFmt(o.created_at)}</TableCell>
                  <TableCell className="tabular text-right">{inr(o.grand_total)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={o.status}
                      onValueChange={(v) => setStatus.mutate({ id: o.id, status: v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.order_no}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium">{detail.customer_name}</p>
                <p className="text-muted-foreground">
                  {[detail.shipping_address, detail.shipping_city, detail.shipping_state, detail.shipping_pincode]
                    .filter(Boolean)
                    .join(", ") || "No address provided"}
                </p>
                <p className="text-muted-foreground">
                  {detail.customer_phone} {detail.customer_email}
                </p>
              </div>
              <div className="divide-y rounded-md border">
                {detail.order_items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between px-3 py-2">
                    <span>
                      {i.product_name} × {i.quantity}
                    </span>
                    <span className="tabular">{inr(i.total)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>Total</span>
                <span className="tabular">{inr(detail.grand_total)}</span>
              </div>
              <Badge variant="secondary">{detail.status}</Badge>
              <Button variant="outline" className="w-full" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
