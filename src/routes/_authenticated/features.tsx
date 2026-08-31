import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, LoadingRows } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessFeatures, useBusinesses, useFeatures } from "@/hooks/useTenant";

export const Route = createFileRoute("/_authenticated/features")({
  head: () => ({
    meta: [
      { title: "Feature Control — Stock Keeper Platform" },
      {
        name: "description",
        content: "Switch platform features on or off globally or for an individual business.",
      },
      { property: "og:title", content: "Feature Control — Stock Keeper Platform" },
      {
        property: "og:description",
        content: "Switch platform features on or off globally or for an individual business.",
      },
    ],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const { data: features, isLoading } = useFeatures();
  const { data: businesses } = useBusinesses();
  const { data: overrides } = useBusinessFeatures();
  const [businessId, setBusinessId] = useState<string>("global");

  const setGlobal = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("features")
        .update({ enabled_globally: enabled })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Global feature updated");
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update feature"),
  });

  const setPerBusiness = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("business_features")
        .upsert(
          { business_id: businessId, feature_key: key, enabled },
          { onConflict: "business_id,feature_key" },
        );
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Business feature updated");
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update feature"),
  });

  if (!isSuperAdmin) {
    return (
      <EmptyState
        title="Super Admin only"
        description="Feature control is managed centrally by the platform Super Admin."
      />
    );
  }

  const groups = Array.from(new Set((features ?? []).map((f) => f.category)));
  const isGlobal = businessId === "global";

  function valueFor(key: string, globalEnabled: boolean) {
    if (isGlobal) return globalEnabled;
    const o = (overrides ?? []).find((x) => x.feature_key === key && x.business_id === businessId);
    return o ? o.enabled : true;
  }

  return (
    <div>
      <PageHeader
        title="Feature control"
        description="Turn capabilities on or off for the whole platform, or override them for one business."
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Scope</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (all businesses)</SelectItem>
                {(businesses ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <Card>
          <LoadingRows />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g} className="divide-y">
              <div className="px-4 py-3 text-sm font-semibold">{g}</div>
              {(features ?? [])
                .filter((f) => f.category === g)
                .map((f) => {
                  const checked = valueFor(f.key, f.enabled_globally);
                  const blockedByGlobal = !isGlobal && !f.enabled_globally;
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {f.name}
                          {f.depends_on && (
                            <Badge variant="outline" className="text-[10px]">
                              needs {f.depends_on}
                            </Badge>
                          )}
                          {blockedByGlobal && (
                            <Badge variant="destructive" className="text-[10px]">
                              off globally
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{f.description}</p>
                      </div>
                      <Switch
                        checked={checked && !blockedByGlobal}
                        disabled={blockedByGlobal}
                        onCheckedChange={(v) =>
                          isGlobal
                            ? setGlobal.mutate({ key: f.key, enabled: v })
                            : setPerBusiness.mutate({ key: f.key, enabled: v })
                        }
                      />
                    </div>
                  );
                })}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
