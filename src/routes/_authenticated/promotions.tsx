import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { Plus, Megaphone, Pencil, Trash2 } from "lucide-react";
import { dateFmt } from "@/lib/format";
import { useCategories } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/promotions")({
  head: () => ({
    meta: [
      { title: "Promotions — Stock Keeper" },
      { name: "description", content: "Create storefront banners, offers and category discounts." },
      { property: "og:title", content: "Promotions — Stock Keeper" },
      { property: "og:description", content: "Create storefront banners, offers and category discounts." },
    ],
  }),
  component: PromotionsPage,
});

type Promotion = {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  discount_type: "percent" | "flat" | "none";
  discount_value: number;
  category_id: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
};

const empty = {
  id: "",
  title: "",
  description: "",
  banner_url: "",
  discount_type: "percent" as Promotion["discount_type"],
  discount_value: "10",
  category_id: "all",
  ends_at: "",
  is_active: true,
};

function PromotionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const { data: categories } = useCategories();

  const { data, isLoading } = useQuery({
    queryKey: ["promotions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Promotion[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Give the promotion a title");
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        banner_url: form.banner_url || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value || 0),
        category_id: form.category_id === "all" ? null : form.category_id,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        is_active: form.is_active,
      };
      if (form.id) {
        const { error } = await supabase.from("promotions").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("promotions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Promotion saved");
      setOpen(false);
      setForm(empty);
      await qc.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promotions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Promotion removed");
      await qc.invalidateQueries({ queryKey: ["promotions"] });
    },
  });

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Promotions"
        description="Offers and banners shown on your customer storefront."
        actions={
          <Button
            className="gap-1.5"
            onClick={() => {
              setForm(empty);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            New promotion
          </Button>
        }
      />

      <Card>
        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No promotions"
            description="Create an offer to highlight products on your storefront."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Promotion</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Runs until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="flex items-center gap-2 font-medium">
                      <Megaphone className="size-4 text-muted-foreground" />
                      {p.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.discount_type === "none"
                      ? "Announcement"
                      : p.discount_type === "percent"
                        ? `${p.discount_value}% off`
                        : `₹${p.discount_value} off`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.ends_at ? dateFmt(p.ends_at) : "No end date"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "default" : "outline"}>
                      {p.is_active ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setForm({
                          id: p.id,
                          title: p.title,
                          description: p.description ?? "",
                          banner_url: p.banner_url ?? "",
                          discount_type: p.discount_type,
                          discount_value: String(p.discount_value),
                          category_id: p.category_id ?? "all",
                          ends_at: p.ends_at ? p.ends_at.slice(0, 10) : "",
                          is_active: p.is_active,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit promotion" : "New promotion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Discount type</Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v) =>
                    setForm({ ...form, discount_type: v as Promotion["discount_type"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="flat">Flat amount</SelectItem>
                    <SelectItem value="none">Announcement only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Value</Label>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) => setForm({ ...form, category_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ends on</Label>
                <Input
                  type="date"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm font-medium">Active</p>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
