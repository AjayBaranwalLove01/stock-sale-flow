import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { PageHeader, LoadingRows, EmptyState } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts } from "@/lib/queries";
import { num, dateTimeFmt } from "@/lib/format";
import {
  useCreateTransfer,
  useGodown,
  useMyWarehouses,
  useStockTransfers,
  useWarehouseStock,
} from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({
    meta: [
      { title: "Stock Transfer — Ledger ERP" },
      {
        name: "description",
        content: "Move stock between your own shops, godowns and warehouses in one safe step.",
      },
      { property: "og:title", content: "Stock Transfer — Ledger ERP" },
      {
        property: "og:description",
        content: "Move stock between your own shops, godowns and warehouses in one safe step.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransfersPage,
});

type Line = { product_id: string; quantity: string };

type TransferRow = {
  id: string;
  transfer_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: string;
  remarks: string | null;
  created_at: string;
  stock_transfer_items: {
    id: string;
    requested_qty: number;
    products: { name: string; sku: string; unit: string } | null;
  }[];
};

function TransfersPage() {
  const { godown, loading } = useGodown();
  const { warehouses, defaultId } = useMyWarehouses();
  const { data: products } = useProducts();
  const { data: transfers, isLoading } = useStockTransfers();
  const create = useCreateTransfer();

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "" }]);

  const source = from || defaultId || "";
  const { data: sourceStock } = useWarehouseStock(source || undefined);

  const availableOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sourceStock ?? []) m.set(s.product_id, Number(s.quantity) - Number(s.reserved_quantity));
    return m;
  }, [sourceStock]);

  const nameOf = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name] as const)),
    [warehouses],
  );

  if (!loading && !godown) {
    return (
      <div>
        <PageHeader title="Stock Transfer" />
        <EmptyState title="Godown management is not enabled for this business" />
      </div>
    );
  }

  const productList = (products ?? []) as { id: string; name: string; sku: string; unit: string }[];

  const submit = () => {
    const items = lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) }));
    if (!source || !to) {
      toast.error("Choose both a source and a destination location");
      return;
    }
    if (source === to) {
      toast.error("Source and destination must be different locations");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one product with a quantity");
      return;
    }
    create.mutate(
      { from: source, to, items, remarks },
      {
        onSuccess: () => {
          toast.success("Stock transferred");
          setLines([{ product_id: "", quantity: "" }]);
          setRemarks("");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Stock Transfer"
        description="Move stock between locations of this business. Totals never change — only where the stock sits."
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>From *</Label>
            <Select value={source} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder="Source location" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>To *</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="Destination location" />
              </SelectTrigger>
              <SelectContent>
                {warehouses
                  .filter((w) => w.id !== source)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Remarks</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {lines.map((l, i) => {
            const avail = l.product_id ? (availableOf.get(l.product_id) ?? 0) : null;
            return (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_160px_120px_40px]">
                <div>
                  <Label className={i === 0 ? "" : "sr-only"}>Product</Label>
                  <Select
                    value={l.product_id}
                    onValueChange={(v) =>
                      setLines(lines.map((x, j) => (i === j ? { ...x, product_id: v } : x)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productList.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {p.sku}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={i === 0 ? "" : "sr-only"}>Available</Label>
                  <p className="h-9 text-sm leading-9 text-muted-foreground">
                    {avail === null ? "—" : num(avail)}
                  </p>
                </div>
                <div>
                  <Label className={i === 0 ? "" : "sr-only"}>Quantity</Label>
                  <Input
                    type="number"
                    value={l.quantity}
                    onChange={(e) =>
                      setLines(lines.map((x, j) => (i === j ? { ...x, quantity: e.target.value } : x)))
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines([...lines, { product_id: "", quantity: "" }])}
          >
            <Plus className="mr-1.5 size-4" /> Add Product
          </Button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={create.isPending}>
            <ArrowLeftRight className="mr-1.5 size-4" /> Transfer Stock
          </Button>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <LoadingRows />
        ) : ((transfers ?? []) as unknown as TransferRow[]).length === 0 ? (
          <EmptyState title="No transfers yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((transfers ?? []) as unknown as TransferRow[]).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{dateTimeFmt(t.created_at)}</TableCell>
                    <TableCell className="text-sm font-medium">{t.transfer_number}</TableCell>
                    <TableCell className="text-sm">{nameOf.get(t.from_warehouse_id) ?? "—"}</TableCell>
                    <TableCell className="text-sm">{nameOf.get(t.to_warehouse_id) ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.stock_transfer_items
                        .map((i) => `${i.products?.name ?? "Item"} × ${num(i.requested_qty)}`)
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
