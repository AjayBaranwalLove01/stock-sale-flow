import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows, StatCard } from "@/components/shared";
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
import { Building2, Plus, Search, Store, Pencil, Globe2 } from "lucide-react";
import { useBusinesses, type Business } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { createBusinessWithAdmin } from "@/lib/tenant.functions";
import { dateFmt } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/businesses")({
  head: () => ({
    meta: [
      { title: "Businesses — Stock Keeper Platform" },
      {
        name: "description",
        content: "Create and manage the businesses running on the platform, their storefronts and admins.",
      },
      { property: "og:title", content: "Businesses — Stock Keeper Platform" },
      {
        property: "og:description",
        content: "Create and manage the businesses running on the platform, their storefronts and admins.",
      },
    ],
  }),
  component: BusinessesPage,
});

const emptyForm = {
  name: "",
  code: "",
  business_type: "Retail",
  subdomain: "",
  address: "",
  city: "",
  state: "",
  country: "India",
  pincode: "",
  phone: "",
  email: "",
  website: "",
  status: "active" as Business["status"],
  customer_site_enabled: true,
  admin_name: "",
  admin_email: "",
  admin_password: "",
};

function BusinessesPage() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const { data, isLoading } = useBusinesses();
  const rows = data ?? [];
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Business | null>(null);
  const create = useServerFn(createBusinessWithAdmin);

  const filtered = useMemo(
    () =>
      rows.filter((b) =>
        [b.name, b.code, b.subdomain, b.city].some((v) =>
          (v ?? "").toLowerCase().includes(search.toLowerCase()),
        ),
      ),
    [rows, search],
  );

  const save = useMutation({
    mutationFn: async () => {
      await create({
        data: {
          ...form,
          email: form.email || undefined,
          business_type: form.business_type || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Business and its admin were created");
      setOpen(false);
      setForm(emptyForm);
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create business"),
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Business> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("businesses").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Business updated");
      setEditing(null);
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update business"),
  });

  if (!isSuperAdmin) {
    return (
      <EmptyState
        title="Super Admin only"
        description="Only a Super Admin can manage the businesses on this platform."
      />
    );
  }

  const active = rows.filter((b) => b.status === "active").length;
  const storefronts = rows.filter((b) => b.customer_site_enabled && b.status === "active").length;

  return (
    <div>
      <PageHeader
        title="Businesses"
        description="Every business on the platform, its storefront address and status."
        actions={
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            Add business
          </Button>
        }
      />

      <div className="grid gap-3 pb-5 sm:grid-cols-3">
        <StatCard label="Businesses" value={rows.length} icon={Building2} />
        <StatCard label="Active" value={active} icon={Globe2} tone="success" />
        <StatCard label="Live storefronts" value={storefronts} icon={Store} tone="info" />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b p-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search businesses…"
            className="h-9 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState title="No businesses yet" description="Create the first business to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Storefront</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.code} · {b.business_type ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{b.subdomain}</p>
                    <Badge variant={b.customer_site_enabled ? "secondary" : "outline"} className="text-[10px]">
                      {b.customer_site_enabled ? "Storefront on" : "Storefront off"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[b.city, b.state].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        b.status === "active"
                          ? "default"
                          : b.status === "suspended"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{dateFmt(b.created_at)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(b)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add business</DialogTitle>
            <DialogDescription>
              Creates the business and its first Business Admin login in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="Business name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Text label="Business code" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
            <Text label="Business type" value={form.business_type} onChange={(v) => setForm({ ...form, business_type: v })} />
            <Text
              label="Storefront subdomain"
              value={form.subdomain}
              onChange={(v) => setForm({ ...form, subdomain: v.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            />
            <Text label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Text label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Text label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            <Text label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Text label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
            <Text label="PIN code" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} />
            <Text label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Business["status"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Customer storefront</p>
                <p className="text-xs text-muted-foreground">Allow customers to browse and order online.</p>
              </div>
              <Switch
                checked={form.customer_site_enabled}
                onCheckedChange={(v) => setForm({ ...form, customer_site_enabled: v })}
              />
            </div>
            <div className="sm:col-span-2">
              <p className="pt-2 text-sm font-semibold">Initial Business Admin</p>
            </div>
            <Text label="Admin name" value={form.admin_name} onChange={(v) => setForm({ ...form, admin_name: v })} />
            <Text label="Admin email" value={form.admin_email} onChange={(v) => setForm({ ...form, admin_email: v })} />
            <Text
              label="Temporary password"
              type="password"
              value={form.admin_password}
              onChange={(v) => setForm({ ...form, admin_password: v })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Create business
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label="Business name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
              <Text
                label="Storefront subdomain"
                value={editing.subdomain}
                onChange={(v) =>
                  setEditing({ ...editing, subdomain: v.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                }
              />
              <Text label="Phone" value={editing.phone ?? ""} onChange={(v) => setEditing({ ...editing, phone: v })} />
              <Text label="Email" value={editing.email ?? ""} onChange={(v) => setEditing({ ...editing, email: v })} />
              <Text label="City" value={editing.city ?? ""} onChange={(v) => setEditing({ ...editing, city: v })} />
              <Text label="State" value={editing.state ?? ""} onChange={(v) => setEditing({ ...editing, state: v })} />
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as Business["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                <p className="text-sm font-medium">Customer storefront</p>
                <Switch
                  checked={editing.customer_site_enabled}
                  onCheckedChange={(v) => setEditing({ ...editing, customer_site_enabled: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={update.isPending}
              onClick={() =>
                editing &&
                update.mutate({
                  id: editing.id,
                  name: editing.name,
                  subdomain: editing.subdomain,
                  phone: editing.phone,
                  email: editing.email,
                  city: editing.city,
                  state: editing.state,
                  status: editing.status,
                  customer_site_enabled: editing.customer_site_enabled,
                })
              }
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
