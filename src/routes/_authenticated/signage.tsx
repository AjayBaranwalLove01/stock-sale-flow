import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Plus,
  Trash2,
  Pencil,
  Monitor,
  GripVertical,
  Play,
  Tv,
  Upload,
  ExternalLink,
} from "lucide-react";
import { useActiveBusiness, useEnabledFeatures } from "@/hooks/useTenant";
import { useProducts } from "@/lib/queries";
import { Slide } from "@/routes/display";
import type { DisplayItem } from "@/lib/signage.functions";
import {
  useSignageAds,
  useSignagePlaylists,
  usePlaylistItems,
  useSignageDisplays,
  useSignageSettings,
  useSaveSignageSettings,
  useSignageMediaUrl,
  uploadSignageMedia,
  relativeTime,
  isOnline,
  type AdType,
  type SignageAd,
} from "@/lib/signage";

export const Route = createFileRoute("/_authenticated/signage")({
  head: () => ({
    meta: [
      { title: "Digital Signage — Store TV Advertising" },
      {
        name: "description",
        content: "Build advertisement playlists and run them on in-store TVs and monitors.",
      },
      { property: "og:title", content: "Digital Signage — Store TV Advertising" },
      {
        property: "og:description",
        content: "Build advertisement playlists and run them on in-store TVs and monitors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignagePage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptyAd = {
  id: "",
  name: "",
  ad_type: "image" as AdType,
  title: "",
  description: "",
  media_path: "",
  media_mime: "",
  media_size: 0,
  product_id: "",
  promotion_id: "",
  use_live_data: true,
  offer_text: "",
  qr_url: "",
  show_qr: false,
  duration_seconds: "10",
  use_full_video: true,
  start_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  days_of_week: [] as number[],
  status: "active" as SignageAd["status"],
};

function SignagePage() {
  const { data: business } = useActiveBusiness();
  const { enabled } = useEnabledFeatures();

  if (!enabled("digital_signage")) {
    return (
      <EmptyState
        title="Digital Signage is turned off"
        description="Ask the platform Super Admin to enable Digital Signage for this business."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Digital Signage"
        description="Advertisements, playlists and store TVs for this business."
        actions={
          <Button variant="outline" className="gap-1.5" asChild>
            <a href="/display" target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Open display page
            </a>
          </Button>
        }
      />
      <Tabs defaultValue="ads">
        <TabsList>
          <TabsTrigger value="ads">Advertisements</TabsTrigger>
          <TabsTrigger value="playlists">Playlists</TabsTrigger>
          <TabsTrigger value="displays">Displays</TabsTrigger>
          <TabsTrigger value="settings">Display settings</TabsTrigger>
        </TabsList>
        <TabsContent value="ads">
          <AdsTab businessId={business?.id ?? null} />
        </TabsContent>
        <TabsContent value="playlists">
          <PlaylistsTab businessId={business?.id ?? null} />
        </TabsContent>
        <TabsContent value="displays">
          <DisplaysTab businessId={business?.id ?? null} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab businessId={business?.id ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------- Advertisements ------------------------------- */

function AdsTab({ businessId }: { businessId: string | null }) {
  const qc = useQueryClient();
  const { data: ads, isLoading } = useSignageAds();
  const { data: products } = useProducts();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyAd);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<SignageAd | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: mediaUrl } = useSignageMediaUrl(form.media_path || null);

  const save = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Select a business first");
      if (!form.name.trim()) throw new Error("Give the advertisement a name");
      if ((form.ad_type === "image" || form.ad_type === "video") && !form.media_path) {
        throw new Error("Upload the media file first");
      }
      if (form.ad_type === "product" && !form.product_id) throw new Error("Choose a product");
      const payload = {
        business_id: businessId,
        name: form.name.trim(),
        ad_type: form.ad_type,
        title: form.title || null,
        description: form.description || null,
        media_path: form.media_path || null,
        media_url: form.media_path || null,
        media_mime: form.media_mime || null,
        media_size: form.media_size || null,
        product_id: form.ad_type === "product" ? form.product_id : null,
        promotion_id: null,
        use_live_data: form.use_live_data,
        offer_text: form.offer_text || null,
        qr_url: form.qr_url || null,
        show_qr: form.show_qr,
        duration_seconds: Math.max(1, Number(form.duration_seconds || 10)),
        use_full_video: form.use_full_video,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        days_of_week: form.days_of_week,
        status: form.status,
      };
      if (form.id) {
        const { error } = await supabase.from("signage_ads").update(payload as never).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("signage_ads").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Advertisement saved");
      setOpen(false);
      setForm(emptyAd);
      await qc.invalidateQueries({ queryKey: ["signage_ads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("signage_ads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Advertisement removed");
      await qc.invalidateQueries({ queryKey: ["signage_ads"] });
    },
  });

  async function handleFile(file: File) {
    if (!businessId) return toast.error("Select a business first");
    setUploading(true);
    try {
      const m = await uploadSignageMedia(file, businessId);
      setForm((f) => ({
        ...f,
        media_path: m.path,
        media_mime: m.mime,
        media_size: m.size,
        ad_type: m.mime.startsWith("video") ? "video" : "image",
        duration_seconds: m.duration ? String(m.duration) : f.duration_seconds,
      }));
      toast.success("Media uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function editAd(a: SignageAd) {
    setForm({
      id: a.id,
      name: a.name,
      ad_type: a.ad_type,
      title: a.title ?? "",
      description: a.description ?? "",
      media_path: a.media_path ?? "",
      media_mime: a.media_mime ?? "",
      media_size: a.media_size ?? 0,
      product_id: a.product_id ?? "",
      promotion_id: a.promotion_id ?? "",
      use_live_data: a.use_live_data,
      offer_text: a.offer_text ?? "",
      qr_url: a.qr_url ?? "",
      show_qr: a.show_qr,
      duration_seconds: String(a.duration_seconds),
      use_full_video: a.use_full_video,
      start_date: a.start_date ?? "",
      end_date: a.end_date ?? "",
      start_time: a.start_time?.slice(0, 5) ?? "",
      end_time: a.end_time?.slice(0, 5) ?? "",
      days_of_week: a.days_of_week ?? [],
      status: a.status,
    });
    setOpen(true);
  }

  const rows = ads ?? [];
  const needsMedia = form.ad_type === "image" || form.ad_type === "video";

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          className="gap-1.5"
          onClick={() => {
            setForm(emptyAd);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add advertisement
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No advertisements yet"
            description="Upload an image or video, or build one from a product."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Advertisement</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Plays</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.title}</p>
                  </TableCell>
                  <TableCell className="text-sm capitalize">{a.ad_type}</TableCell>
                  <TableCell className="text-sm">
                    {a.ad_type === "video" && a.use_full_video ? "Full video" : `${a.duration_seconds}s`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.start_date || a.end_date
                      ? `${a.start_date ?? "—"} → ${a.end_date ?? "—"}`
                      : "Always"}
                    {a.days_of_week?.length ? (
                      <div>{a.days_of_week.map((d) => DAYS[d]).join(", ")}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.display_count}
                    <div className="text-xs text-muted-foreground">{relativeTime(a.last_displayed_at)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status === "active" ? "default" : "outline"}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setPreview(a)}>
                      <Play className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => editAd(a)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AdPreviewDialog ad={preview} onClose={() => setPreview(null)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit advertisement" : "New advertisement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Advertisement name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.ad_type}
                  onValueChange={(v) => setForm({ ...form, ad_type: v as AdType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="text">Text message</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {needsMedia && (
              <div className="space-y-1.5">
                <Label>Media file</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    {uploading ? "Uploading…" : form.media_path ? "Replace file" : "Upload image or video"}
                  </Button>
                  {form.media_path && (
                    <span className="truncate text-xs text-muted-foreground">
                      {(form.media_size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                </div>
                {mediaUrl &&
                  (form.ad_type === "video" ? (
                    <video src={mediaUrl} className="mt-2 max-h-48 rounded border" controls muted />
                  ) : (
                    <img src={mediaUrl} alt="Preview" className="mt-2 max-h-48 rounded border object-contain" />
                  ))}
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or WEBP up to 10MB. MP4 or WebM up to 200MB and 10 minutes.
                </p>
              </div>
            )}

            {form.ad_type === "product" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Product</Label>
                  <Select
                    value={form.product_id}
                    onValueChange={(v) => {
                      const p = (products ?? []).find((x) => (x as { id: string }).id === v) as
                        | { name: string; description: string | null }
                        | undefined;
                      setForm({
                        ...form,
                        product_id: v,
                        name: form.name || (p?.name ?? ""),
                        title: form.title || (p?.name ?? ""),
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products ?? []).map((p) => {
                        const prod = p as { id: string; name: string };
                        return (
                          <SelectItem key={prod.id} value={prod.id}>
                            {prod.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <Label>Use live product data</Label>
                    <p className="text-xs text-muted-foreground">Always show the current price.</p>
                  </div>
                  <Switch
                    checked={form.use_live_data}
                    onCheckedChange={(v) => setForm({ ...form, use_live_data: v })}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Offer text (e.g. 20% OFF)</Label>
                <Input
                  value={form.offer_text}
                  onChange={(e) => setForm({ ...form, offer_text: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Display duration (seconds)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.duration_seconds}
                  onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
                  disabled={form.ad_type === "video" && form.use_full_video}
                />
              </div>
              {form.ad_type === "video" && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
                  <Label>Play the complete video</Label>
                  <Switch
                    checked={form.use_full_video}
                    onCheckedChange={(v) => setForm({ ...form, use_full_video: v })}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Days of week (none selected = every day)</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => {
                  const on = form.days_of_week.includes(i);
                  return (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() =>
                        setForm({
                          ...form,
                          days_of_week: on
                            ? form.days_of_week.filter((x) => x !== i)
                            : [...form.days_of_week, i].sort(),
                        })
                      }
                    >
                      {d}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label>Show QR code</Label>
                  <p className="text-xs text-muted-foreground">Scan-to-shop link on screen.</p>
                </div>
                <Switch checked={form.show_qr} onCheckedChange={(v) => setForm({ ...form, show_qr: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>QR link</Label>
                <Input
                  placeholder="https://yourstore.example/shop/..."
                  value={form.qr_url}
                  onChange={(e) => setForm({ ...form, qr_url: e.target.value })}
                  disabled={!form.show_qr}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as SignageAd["status"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save advertisement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdPreviewDialog({ ad, onClose }: { ad: SignageAd | null; onClose: () => void }) {
  const { data: url } = useSignageMediaUrl(ad?.media_path ?? null);
  const { data: products } = useProducts();
  if (!ad) return null;
  const product = (products ?? []).find((p) => (p as { id: string }).id === ad.product_id) as
    | {
        name: string;
        description: string | null;
        mrp: number;
        selling_price: number;
        discount: number;
        unit: string;
        in_stock?: boolean;
      }
    | undefined;

  const item: DisplayItem = {
    id: ad.id,
    type: ad.ad_type,
    name: ad.name,
    title: ad.title,
    description: ad.description,
    media_url: url ?? null,
    offer_text: ad.offer_text,
    duration: ad.duration_seconds,
    use_full_video: ad.use_full_video,
    show_qr: ad.show_qr,
    qr_url: ad.qr_url,
    start_time: null,
    end_time: null,
    days_of_week: [],
    product: product
      ? {
          name: product.name,
          description: product.description,
          mrp: product.mrp,
          price: product.selling_price,
          discount: product.discount,
          unit: product.unit,
          image: null,
          in_stock: true,
        }
      : null,
    promotion: null,
  };

  return (
    <Dialog open={!!ad} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Advertisement preview</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black text-white">
          <Slide item={item} transition="fade" muted onEnded={() => undefined} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Playlists --------------------------------- */

function PlaylistsTab({ businessId }: { businessId: string | null }) {
  const qc = useQueryClient();
  const { data: playlists, isLoading } = useSignagePlaylists();
  const { data: ads } = useSignageAds();
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? playlists?.[0]?.id ?? null;
  const { data: items } = usePlaylistItems(activeId);
  const [name, setName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const adMap = useMemo(() => new Map((ads ?? []).map((a) => [a.id, a])), [ads]);

  const create = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Select a business first");
      if (!name.trim()) throw new Error("Name the playlist");
      const { error } = await supabase
        .from("signage_playlists")
        .insert({ business_id: businessId, name: name.trim() } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      setName("");
      toast.success("Playlist created");
      await qc.invalidateQueries({ queryKey: ["signage_playlists"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create playlist"),
  });

  const addAd = useMutation({
    mutationFn: async (adId: string) => {
      if (!businessId || !activeId) throw new Error("Choose a playlist first");
      const { error } = await supabase.from("signage_playlist_items").insert({
        business_id: businessId,
        playlist_id: activeId,
        ad_id: adId,
        sort_order: (items?.length ?? 0) + 1,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signage_playlist_items"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add advertisement"),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("signage_playlist_items").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signage_playlist_items"] }),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("signage_playlist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signage_playlist_items"] }),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!businessId) return;
      await supabase.from("signage_playlists").update({ is_default: false } as never).eq("business_id", businessId);
      const { error } = await supabase.from("signage_playlists").update({ is_default: true } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Default playlist updated");
      await qc.invalidateQueries({ queryKey: ["signage_playlists"] });
    },
  });

  const removePlaylist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("signage_playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelected(null);
      await qc.invalidateQueries({ queryKey: ["signage_playlists"] });
    },
  });

  async function reorder(from: number, to: number) {
    const list = [...(items ?? [])];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await Promise.all(
      list.map((it, i) =>
        supabase.from("signage_playlist_items").update({ sort_order: i } as never).eq("id", it.id),
      ),
    );
    await qc.invalidateQueries({ queryKey: ["signage_playlist_items"] });
  }

  if (isLoading) return <Card><LoadingRows /></Card>;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="p-3">
        <p className="mb-2 text-sm font-semibold">Playlists</p>
        <div className="space-y-1">
          {(playlists ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                p.id === activeId ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <span className="truncate">{p.name}</span>
              {p.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
            </button>
          ))}
          {!playlists?.length && <p className="text-xs text-muted-foreground">No playlists yet.</p>}
        </div>
        <div className="mt-3 flex gap-1.5">
          <Input placeholder="New playlist" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="icon" onClick={() => create.mutate()}>
            <Plus className="size-4" />
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        {!activeId ? (
          <EmptyState title="No playlist selected" description="Create a playlist to start building a sequence." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Select onValueChange={(v) => addAd.mutate(v)}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Add advertisement…" />
                </SelectTrigger>
                <SelectContent>
                  {(ads ?? [])
                    .filter((a) => !(items ?? []).some((i) => i.ad_id === a.id))
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-1.5" onClick={() => setPreviewOpen(true)}>
                <Play className="size-4" />
                Preview playlist
              </Button>
              <Button
                variant="outline"
                onClick={() => activeId && setDefault.mutate(activeId)}
              >
                Make default
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => activeId && removePlaylist.mutate(activeId)}
              >
                Delete playlist
              </Button>
            </div>

            <div className="divide-y rounded-md border">
              {(items ?? []).map((it, idx) => {
                const ad = adMap.get(it.ad_id);
                return (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null && dragIndex !== idx) void reorder(dragIndex, idx);
                      setDragIndex(null);
                    }}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <GripVertical className="size-4 cursor-grab text-muted-foreground" />
                    <span className="w-6 text-sm text-muted-foreground">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ad?.name ?? "Advertisement"}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {ad?.ad_type} ·{" "}
                        {ad?.ad_type === "video" && ad?.use_full_video
                          ? "full video"
                          : `${ad?.duration_seconds ?? 10} sec`}
                      </p>
                    </div>
                    <Switch
                      checked={it.enabled}
                      onCheckedChange={(v) => updateItem.mutate({ id: it.id, patch: { enabled: v } })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeItem.mutate(it.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              {!items?.length && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  This playlist is empty. Add advertisements above.
                </p>
              )}
            </div>
          </>
        )}
      </Card>

      <PlaylistPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        ads={(items ?? []).filter((i) => i.enabled).map((i) => adMap.get(i.ad_id)).filter(Boolean) as SignageAd[]}
      />
    </div>
  );
}

function PlaylistPreview({
  open,
  onClose,
  ads,
}: {
  open: boolean;
  onClose: () => void;
  ads: SignageAd[];
}) {
  const [i, setI] = useState(0);
  const ad = ads[i % Math.max(ads.length, 1)] ?? null;
  const { data: url } = useSignageMediaUrl(ad?.media_path ?? null);

  if (!open) return null;

  const item: DisplayItem | null = ad
    ? {
        id: ad.id,
        type: ad.ad_type,
        name: ad.name,
        title: ad.title,
        description: ad.description,
        media_url: url ?? null,
        offer_text: ad.offer_text,
        duration: ad.duration_seconds,
        use_full_video: ad.use_full_video,
        show_qr: ad.show_qr,
        qr_url: ad.qr_url,
        start_time: null,
        end_time: null,
        days_of_week: [],
        product: null,
        promotion: null,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Playlist preview</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black text-white">
          {item ? (
            <Slide item={item} transition="fade" muted onEnded={() => setI((x) => x + 1)} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm">Playlist is empty</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setI((x) => x + 1)} disabled={!ads.length}>
            Next advertisement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Displays ---------------------------------- */

function DisplaysTab({ businessId }: { businessId: string | null }) {
  const qc = useQueryClient();
  const { data: displays, isLoading } = useSignageDisplays();
  const { data: playlists } = useSignagePlaylists();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", playlist_id: "", orientation: "landscape" });

  const create = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Select a business first");
      if (!form.name.trim()) throw new Error("Name the display");
      const { data: code, error: codeErr } = await supabase.rpc("signage_new_pair_code");
      if (codeErr) throw codeErr;
      const { error } = await supabase.from("signage_displays").insert({
        business_id: businessId,
        name: form.name.trim(),
        location: form.location || null,
        playlist_id: form.playlist_id || null,
        orientation: form.orientation,
        pair_code: code as unknown as string,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Display created — open /display on the TV and enter the code");
      setOpen(false);
      setForm({ name: "", location: "", playlist_id: "", orientation: "landscape" });
      await qc.invalidateQueries({ queryKey: ["signage_displays"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create display"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("signage_displays").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signage_displays"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("signage_displays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signage_displays"] }),
  });

  const rows = displays ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Add display
        </Button>
      </div>
      <Card>
        {isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No displays registered"
            description="Register a TV, then open /display on that screen and enter its pairing code."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display</TableHead>
                <TableHead>Playlist</TableHead>
                <TableHead>Pair code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <p className="flex items-center gap-2 font-medium">
                      <Tv className="size-4 text-muted-foreground" />
                      {d.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.location}</p>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={d.playlist_id ?? "none"}
                      onValueChange={(v) =>
                        update.mutate({ id: d.id, patch: { playlist_id: v === "none" ? null : v } })
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Business default</SelectItem>
                        {(playlists ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{d.pair_code}</TableCell>
                  <TableCell>
                    {d.status === "revoked" ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : isOnline(d.last_seen_at) ? (
                      <Badge>Online</Badge>
                    ) : (
                      <Badge variant="outline">Offline</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {relativeTime(d.last_seen_at)}
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update.mutate({
                          id: d.id,
                          patch: { status: d.status === "active" ? "revoked" : "active" },
                        })
                      }
                    >
                      {d.status === "active" ? "Revoke" : "Restore"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(d.id)}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register a display</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input
                placeholder="Main Store TV"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                placeholder="Front counter"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Playlist</Label>
              <Select
                value={form.playlist_id || "none"}
                onValueChange={(v) => setForm({ ...form, playlist_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Business default</SelectItem>
                  {(playlists ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Orientation</Label>
              <Select
                value={form.orientation}
                onValueChange={(v) => setForm({ ...form, orientation: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="landscape">Landscape</SelectItem>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Create display
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------- Settings ---------------------------------- */

function SettingsTab({ businessId }: { businessId: string | null }) {
  const { data: settings } = useSignageSettings(businessId);
  const { data: playlists } = useSignagePlaylists();
  const save = useSaveSignageSettings(businessId);

  const s = settings ?? {
    business_id: businessId ?? "",
    default_playlist_id: null,
    transition: "fade" as const,
    default_duration: 10,
    video_autoplay: true,
    video_muted: true,
    loop_playlist: true,
    orientation: "landscape" as const,
    show_clock: true,
    show_business_name: true,
    show_logo: false,
  };

  const set = (patch: Record<string, unknown>) =>
    save.mutate(patch, {
      onSuccess: () => toast.success("Display settings saved"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
    });

  const toggles: { key: keyof typeof s; label: string; hint: string }[] = [
    { key: "video_autoplay", label: "Video autoplay", hint: "Start videos as soon as they appear." },
    { key: "video_muted", label: "Mute videos", hint: "Required by most browsers for autoplay." },
    { key: "loop_playlist", label: "Loop playlist", hint: "Restart from the first advertisement." },
    { key: "show_clock", label: "Show clock", hint: "Small time overlay in the corner." },
    { key: "show_business_name", label: "Show business name", hint: "Displayed beside the clock." },
    { key: "show_logo", label: "Show business logo", hint: "Overlay your store logo." },
  ];

  return (
    <Card className="max-w-2xl space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Default playlist</Label>
          <Select
            value={s.default_playlist_id ?? "none"}
            onValueChange={(v) => set({ default_playlist_id: v === "none" ? null : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {(playlists ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Transition effect</Label>
          <Select value={s.transition} onValueChange={(v) => set({ transition: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fade">Fade</SelectItem>
              <SelectItem value="slide">Slide</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Default image duration (seconds)</Label>
          <Input
            type="number"
            min={1}
            defaultValue={s.default_duration}
            onBlur={(e) => set({ default_duration: Math.max(1, Number(e.target.value || 10)) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Display orientation</Label>
          <Select value={s.orientation} onValueChange={(v) => set({ orientation: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="landscape">Landscape</SelectItem>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="divide-y rounded-md border">
        {toggles.map((t) => (
          <div key={String(t.key)} className="flex items-center justify-between gap-4 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </div>
            <Switch
              checked={Boolean(s[t.key])}
              onCheckedChange={(v) => set({ [String(t.key)]: v })}
            />
          </div>
        ))}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Monitor className="size-3.5" />
        Open <code className="rounded bg-muted px-1">/display</code> on the TV browser and enter the
        pairing code from the Displays tab.
      </p>
    </Card>
  );
}
