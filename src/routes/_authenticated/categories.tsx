import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, CornerDownRight } from "lucide-react";
import {
  useCategories,
  logAudit,
  type Category,
  useProductCategoryLinks,
  useUnmapProduct,
  useProducts,
} from "@/lib/queries";

import { MultiImagePicker, Thumb } from "@/components/ImagePicker";
import { fetchGallery, saveGallery, type GalleryImage } from "@/lib/images";
import { dateFmt } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Ledger ERP" },
      { name: "description", content: "Manage parent and child product categories." },
      { property: "og:title", content: "Categories — Ledger ERP" },
      { property: "og:description", content: "Manage parent and child product categories." },
    ],
  }),
  component: CategoriesPage,
});

const empty = {
  id: "",
  code: "",
  name: "",
  parent_id: "none",
  description: "",
  image_sm: "",
  image_md: "",
  image_lg: "",
  status: "active" as "active" | "inactive",
};

/** Categories can nest up to 4 levels deep. */
const MAX_LEVELS = 4;



function CategoriesPage() {
  const qc = useQueryClient();
  const { data: categories, isLoading } = useCategories();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [viewCat, setViewCat] = useState<Category | null>(null);
  const { data: links } = useProductCategoryLinks();
  const { data: allProducts } = useProducts();
  const unmap = useUnmapProduct();

  /** Products mapped to the category currently being inspected. */
  const mappedProducts = useMemo(() => {
    if (!viewCat) return [];
    const ids = new Set(
      (links ?? []).filter((l) => l.category_id === viewCat.id).map((l) => l.product_id),
    );
    return (allProducts ?? []).filter((p) => ids.has(p.id));
  }, [viewCat, links, allProducts]);


  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of links ?? []) map[p.category_id] = (map[p.category_id] ?? 0) + 1;
    return map;
  }, [links]);


  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        parent_id: form.parent_id === "none" ? null : form.parent_id,
        description: form.description.trim() || null,
        image_sm: gallery[0]?.sm ?? null,
        image_md: gallery[0]?.md ?? null,
        image_lg: gallery[0]?.lg ?? null,
        image_url: gallery[0]?.md ?? null,
        status: form.status,
      };

      if (!payload.code || !payload.name) throw new Error("Code and name are required");
      if (payload.parent_id) {
        const pd = depthOf.get(payload.parent_id) ?? 0;
        if (pd >= MAX_LEVELS - 1)
          throw new Error(`Categories can only be nested ${MAX_LEVELS} levels deep`);
      }

      if (form.id) {
        const { error } = await supabase.from("categories").update(payload).eq("id", form.id);
        if (error) throw error;
        await saveGallery("category", form.id, gallery);
        await logAudit("Categories", "Category Updated", form.id, null, payload);
      } else {
        const { data, error } = await supabase.from("categories").insert(payload).select().single();
        if (error) throw error;
        await saveGallery("category", data.id, gallery);
        await logAudit("Categories", "Category Created", data.id, null, payload);
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Category updated" : "Category created");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["categories"] });
      void qc.invalidateQueries({ queryKey: ["catalog-images"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (cat: Category) => {
      if ((counts?.[cat.id] ?? 0) > 0)
        throw new Error("Cannot delete: products are assigned to this category");
      const children = (categories ?? []).filter((c) => c.parent_id === cat.id);
      if (children.length) throw new Error("Cannot delete: this category has subcategories");
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);
      if (error) throw error;
      await logAudit("Categories", "Category Deleted", cat.id, cat, null);
    },
    onSuccess: () => {
      toast.success("Category deleted");
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setToDelete(null);
    },
  });

  const toggle = useMutation({
    mutationFn: async (cat: Category) => {
      const status = cat.status === "active" ? "inactive" : "active";
      const { error } = await supabase.from("categories").update({ status }).eq("id", cat.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const nameOf = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );

  /** Full tree flattened depth-first, max 4 nesting levels (depth 0–3). */
  const tree = useMemo(() => {
    const list = categories ?? [];
    const byParent = new Map<string | null, Category[]>();
    for (const c of list) {
      const k = c.parent_id ?? null;
      byParent.set(k, [...(byParent.get(k) ?? []), c]);
    }
    const rows: (Category & { depth: number })[] = [];
    const walk = (parent: string | null, depth: number) => {
      if (depth >= MAX_LEVELS) return;
      for (const c of byParent.get(parent) ?? []) {
        rows.push({ ...c, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }, [categories]);

  const depthOf = useMemo(
    () => new Map(tree.map((c) => [c.id, c.depth])),
    [tree],
  );

  /** Descendants of the category being edited cannot become its parent. */
  const blockedIds = useMemo(() => {
    const blocked = new Set<string>();
    if (!form.id) return blocked;
    blocked.add(form.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories ?? []) {
        if (c.parent_id && blocked.has(c.parent_id) && !blocked.has(c.id)) {
          blocked.add(c.id);
          grew = true;
        }
      }
    }
    return blocked;
  }, [categories, form.id]);

  const parentOptions = tree.filter(
    (c) => !blockedIds.has(c.id) && c.depth < MAX_LEVELS - 1,
  );

  const ordered = useMemo(
    () =>
      tree.filter((c) => {
        const s = search.toLowerCase();
        const match = !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s);
        const st = filter === "all" || c.status === filter;
        return match && st;
      }),
    [tree, search, filter],
  );


  return (
    <div>
      <PageHeader
        title="Categories"
        description="All products must belong to a category. Supports parent and child levels."
        actions={
          <Button
            onClick={() => {
              setForm(empty);
              setGallery([]);
              setOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-4" />
            Add Category
          </Button>
        }
      />

      <Card className="overflow-hidden py-0 shadow-none">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingRows />
        ) : ordered.length === 0 ? (
          <EmptyState title="No categories yet" description="Create your first category to start adding products." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${c.depth * 18}px` }}
                    >
                      {c.depth > 0 && <CornerDownRight className="size-3.5 text-muted-foreground" />}
                      <Thumb path={c.image_sm} alt={c.name} className="size-8" />
                      <span className={c.depth === 0 ? "font-medium" : undefined}>{c.name}</span>
                    </span>
                  </TableCell>


                  <TableCell className="text-muted-foreground">
                    {c.parent_id ? nameOf.get(c.parent_id) : "—"}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    <Button variant="link" className="h-auto p-0" onClick={() => setViewCat(c)}>
                      {counts?.[c.id] ?? 0}
                    </Button>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.status === "active"}
                        onCheckedChange={() => toggle.mutate(c)}
                      />
                      <Badge variant={c.status === "active" ? "secondary" : "outline"}>
                        {c.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{dateFmt(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setForm({
                          id: c.id,
                          code: c.code,
                          name: c.name,
                          parent_id: c.parent_id ?? "none",
                          description: c.description ?? "",
                          image_sm: c.image_sm ?? "",
                          image_md: c.image_md ?? "",
                          image_lg: c.image_lg ?? "",
                          status: c.status,
                        });

                        setGallery([]);
                        void fetchGallery("category", c.id).then((g) => {
                          setGallery(
                            g.length
                              ? g
                              : c.image_md
                                ? [{ sm: c.image_sm ?? "", md: c.image_md, lg: c.image_lg ?? "" }]
                                : [],
                          );
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(c)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>
              Subcategories can be nested up to 4 levels, e.g. Electronics → Mobile → Android → Budget.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="MOB"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mobile"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parent category</Label>
              <Select
                value={form.parent_id}
                onValueChange={(v) => setForm({ ...form, parent_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (top level)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {"— ".repeat(p.depth)}
                      {p.name}
                    </SelectItem>
                  ))}

                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v: "active" | "inactive") => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <MultiImagePicker
                label="Category images (optional)"
                folder="categories"
                value={gallery}
                onChange={setGallery}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Save category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Categories with products or subcategories cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove.mutate(toDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewCat} onOpenChange={(o) => !o && setViewCat(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Products in {viewCat?.name}</DialogTitle>
            <DialogDescription>
              Products mapped to this category. Use Category Mapping to add more.
            </DialogDescription>
          </DialogHeader>
          {mappedProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No products mapped to this category yet.
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappedProducts.map((p) => {
                    const link = (links ?? []).find(
                      (l) => l.product_id === p.id && l.category_id === viewCat?.id,
                    );
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "active" ? "secondary" : "outline"}>
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!link || p.category_id === viewCat?.id}
                            title={
                              p.category_id === viewCat?.id
                                ? "Primary category — change it on the product"
                                : "Remove from this category"
                            }
                            onClick={() =>
                              viewCat &&
                              unmap.mutate({
                                productId: p.id,
                                categoryId: viewCat.id,
                                productName: p.name,
                                categoryName: viewCat.name,
                              })
                            }

                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
