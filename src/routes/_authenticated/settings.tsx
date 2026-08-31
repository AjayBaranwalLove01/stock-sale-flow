import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, LoadingRows } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useSettings, logAudit } from "@/lib/queries";
import { UNITS, GST_RATES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Business Settings — Ledger ERP" },
      { name: "description", content: "Configure business profile, GST details, invoice numbering and inventory rules." },
      { property: "og:title", content: "Business Settings — Ledger ERP" },
      { property: "og:description", content: "Configure business profile, GST details, invoice numbering and inventory rules." },
    ],
  }),
  component: SettingsPage,
});

type Val = string | number | boolean | null;
interface Form {
  id?: Val;
  business_name?: Val;
  address?: Val;
  phone?: Val;
  email?: Val;
  gstin?: Val;
  website?: Val;
  state?: Val;
  invoice_prefix?: Val;
  invoice_start_number?: Val;
  terms_conditions?: Val;
  allow_negative_stock?: Val;
  low_stock_threshold?: Val;
  default_unit?: Val;
  default_gst?: Val;
  currency?: Val;
  financial_year_start?: Val;
}

function SettingsPage() {
  const { data, isLoading } = useSettings();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>({});

  useEffect(() => {
    if (data) setF({ ...(data as unknown as Form) });
  }, [data]);

  const set = (k: keyof Form, v: Val) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        business_name: String(f.business_name ?? ""),
        address: (f.address as string) || null,
        phone: (f.phone as string) || null,
        email: (f.email as string) || null,
        gstin: (f.gstin as string) || null,
        website: (f.website as string) || null,
        state: (f.state as string) || null,
        invoice_prefix: String(f.invoice_prefix ?? "INV"),
        invoice_start_number: Number(f.invoice_start_number ?? 1),
        terms_conditions: (f.terms_conditions as string) || null,
        allow_negative_stock: Boolean(f.allow_negative_stock),
        low_stock_threshold: Number(f.low_stock_threshold ?? 0),
        default_unit: String(f.default_unit ?? "Piece"),
        default_gst: Number(f.default_gst ?? 18),
        currency: String(f.currency ?? "INR"),
        financial_year_start: String(f.financial_year_start ?? "2024-04-01"),
      };
      if (!payload.business_name.trim()) throw new Error("Business name is required");
      const { error } = await supabase
        .from("business_settings")
        .update(payload)
        .eq("id", String(f.id));
      if (error) throw error;
      await logAudit("Settings", "Updated", String(f.id), data, payload);
    },
    onSuccess: () => {
      toast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: ["business_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingRows />;

  return (
    <div>
      <PageHeader
        title="Business Settings"
        description="These values are used on invoices, tax calculations and stock rules."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1.5 size-4" /> Save Changes
          </Button>
        }
      />

      <Tabs defaultValue="business">
        <TabsList>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="invoice">Invoice & Tax</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="mt-4">
          <Card className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Business Name *" v={f.business_name} onChange={(v) => set("business_name", v)} />
            <Field label="GSTIN" v={f.gstin} onChange={(v) => set("gstin", v)} />
            <Field label="Phone" v={f.phone} onChange={(v) => set("phone", v)} />
            <Field label="Email" v={f.email} onChange={(v) => set("email", v)} />
            <Field label="Website" v={f.website} onChange={(v) => set("website", v)} />
            <Field label="State" v={f.state} onChange={(v) => set("state", v)} />
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Textarea
                rows={3}
                value={String(f.address ?? "")}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="invoice" className="mt-4">
          <Card className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Invoice Prefix" v={f.invoice_prefix} onChange={(v) => set("invoice_prefix", v)} />
            <Field
              label="Invoice Start Number"
              type="number"
              v={f.invoice_start_number}
              onChange={(v) => set("invoice_start_number", v)}
            />
            <div>
              <Label>Default GST Rate (%)</Label>
              <Select value={String(f.default_gst ?? 18)} onValueChange={(v) => set("default_gst", Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Currency" v={f.currency} onChange={(v) => set("currency", v)} />
            <Field
              label="Financial Year Start"
              type="date"
              v={f.financial_year_start}
              onChange={(v) => set("financial_year_start", v)}
            />
            <div className="md:col-span-2">
              <Label>Invoice Terms & Conditions</Label>
              <Textarea
                rows={4}
                value={String(f.terms_conditions ?? "")}
                onChange={(e) => set("terms_conditions", e.target.value)}
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <Card className="grid gap-4 p-5 md:grid-cols-2">
            <div>
              <Label>Default Unit</Label>
              <Select value={String(f.default_unit ?? "Piece")} onValueChange={(v) => set("default_unit", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Low Stock Threshold"
              type="number"
              v={f.low_stock_threshold}
              onChange={(v) => set("low_stock_threshold", v)}
            />
            <div className="flex items-center justify-between rounded-md border p-4 md:col-span-2">
              <div>
                <Label>Allow negative stock</Label>
                <p className="text-xs text-muted-foreground">
                  When off, sales are blocked if stock would go below zero.
                </p>
              </div>
              <Switch
                checked={Boolean(f.allow_negative_stock)}
                onCheckedChange={(v) => set("allow_negative_stock", v)}
              />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  v,
  onChange,
  type = "text",
}: {
  label: string;
  v: unknown;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={String(v ?? "")} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
