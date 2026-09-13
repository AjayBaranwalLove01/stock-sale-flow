import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Warehouse as WarehouseIcon, Plus, Star, Boxes, IndianRupee } from "lucide-react";
import { PageHeader, LoadingRows, EmptyState, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveBusiness } from "@/hooks/useTenant";
import { useProducts } from "@/lib/queries";
import { inr, num } from "@/lib/format";
import {
  useGodown,
  useSaveWarehouse,
  useSetDefaultWarehouse,
  useWarehouses,
  useWarehouseStock,
  WAREHOUSE_TYPES,
  WAREHOUSE_TYPE_LABELS,
  type Warehouse,
  type WarehouseType,
} from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/warehouses")({
  head: () => ({
    meta: [
      { title: "Godowns & Warehouses — Ledger ERP" },
      {
        name: "description",
        content: "Manage shops, godowns, warehouses and branches and see stock held at each location.",
      },
      { property: "og:title", content: "Godowns & Warehouses — Ledger ERP" },
      {
        property: "og:description",
        content: "Manage shops, godowns, warehouses and branches and see stock held at each location.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WarehousesPage,
});

type Editing = Partial<Warehouse> | null;

function WarehousesPage() {
  const { godown, loading } = useGodown();
  const { data: business } = useActiveBusiness();
  const { data: warehouses, isLoading } = useWarehouses();
  const { data: stock } = useWarehouseStock();
  const { data: products } = useProducts();
  const save = useSaveWarehouse();
  const setDefault = useSetDefaultWarehouse();
  const [editing, setEditing] = useState<Editing>(null);

  const costOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of (products ?? []) as { id: string; purchase_price: number }[]) {
      m.set(p.id, Number(p.purchase_price) || 0);
    }
    return m;
  }, [products]);

  const summary = useMemo(() => {
    const m = new Map<string, { qty: number; value: number }>();
    for (const s of stock ?? []) {
      const cur = m.get(s.warehouse_id) ?? { qty: 0, value: 0 };
      cur.qty += Number(s.quantity);
      cur.value += Number(s.quantity) * (costOf.get(s.product_id) ?? 0);
      m.set(s.warehouse_id, cur);
    }
    return m;
  }, [stock, costOf]);

  if (!loading && !godown) {
    return (
      <div>
        <PageHeader title="Godowns & Warehouses" />
        <EmptyState title="Godown management is not enabled for this business" />
      </div>
    );
  }

  const rows = warehouses ?? [];
  const totalValue = Array.from(summary.values()).reduce((a, v) => a + v.value, 0);

  return (
    <div>
      <PageHeader
        title="Godowns & Warehouses"
        description="Stock locations for this business. Locations are never deleted — deactivate them instead."
        actions={
          <Button onClick={() => setEditing({ type: "GODOWN", is_active: true })}>
            <Plus className="mr-1.5 size-4" /> Add Location
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Locations" value={rows.length} icon={WarehouseIcon} />
        <StatCard label="Active" value={rows.filter((w) => w.is_active).length} icon={Boxes} tone="info" />
        <StatCard label="Stock Value" value={inr(totalValue)} icon={IndianRupee} tone="info" />
      </div>

      <Card>
        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState title="No locations yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Stock Qty</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((w) => {
                  const s = summary.get(w.id) ?? { qty: 0, value: 0 };
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm font-medium">
                        {w.name}
                        {w.is_default && (
                          <Badge variant="secondary" className="ml-2">
                            Default
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{w.code}</TableCell>
                      <TableCell className="text-sm">{WAREHOUSE_TYPE_LABELS[w.type] ?? w.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[w.contact_person, w.phone].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="tabular text-right">{num(s.qty)}</TableCell>
                      <TableCell className="tabular text-right">{inr(s.value)}</TableCell>
                      <TableCell>
                        <Badge variant={w.is_active ? "secondary" : "outline"}>
                          {w.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1 text-right whitespace-nowrap">
                        {!w.is_default && w.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDefault.mutate(w.id, {
                                onSuccess: () => toast.success(`${w.name} is now the default location`),
                                onError: (e: Error) => toast.error(e.message),
                              })
                            }
                          >
                            <Star className="mr-1.5 size-4" /> Make Default
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setEditing(w)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Name *</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Code *</Label>
                <Input
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={editing.type ?? "GODOWN"}
                  onValueChange={(v) => setEditing({ ...editing, type: v as WarehouseType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAREHOUSE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {WAREHOUSE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Address</Label>
                <Input
                  value={editing.address ?? ""}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={editing.contact_person ?? ""}
                  onChange={(e) => setEditing({ ...editing, contact_person: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Input
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
              {editing.id && !editing.is_default && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    checked={editing.is_active ?? true}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  />
                  <span className="text-sm">Active</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() => {
                if (!editing?.name?.trim() || !editing?.code?.trim()) {
                  toast.error("Name and code are required");
                  return;
                }
                if (!editing.id && !business?.id) {
                  toast.error("No active business selected");
                  return;
                }
                save.mutate(
                  {
                    ...(editing.id ? { id: editing.id } : { business_id: business!.id }),
                    name: editing.name.trim(),
                    code: editing.code.trim(),
                    type: (editing.type ?? "GODOWN") as WarehouseType,
                    address: editing.address ?? null,
                    contact_person: editing.contact_person ?? null,
                    phone: editing.phone ?? null,
                    notes: editing.notes ?? null,
                    is_active: editing.is_active ?? true,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Location saved");
                      setEditing(null);
                    },
                    onError: (e: Error) =>
                      toast.error(
                        e.message.includes("warehouses_business_code_uidx")
                          ? "Another location already uses this code"
                          : e.message,
                      ),
                  },
                );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
