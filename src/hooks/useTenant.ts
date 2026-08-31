import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Business = {
  id: string;
  name: string;
  code: string;
  business_type: string | null;
  subdomain: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: "active" | "inactive" | "suspended";
  customer_site_enabled: boolean;
  created_at: string;
};

export function useBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").order("name");
      if (error) throw error;
      return data as Business[];
    },
  });
}

/** The business whose data the signed-in user is currently working in. */
export function useActiveBusiness() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["active-business", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: bid } = await supabase.rpc("current_business_id");
      if (!bid) return null;
      const { data } = await supabase.from("businesses").select("*").eq("id", bid).maybeSingle();
      return (data ?? null) as Business | null;
    },
  });
}

export function useSwitchBusiness() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (businessId: string | null) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ active_business_id: businessId })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
    },
  });
}

export type Feature = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  depends_on: string | null;
  enabled_globally: boolean;
};

export function useFeatures() {
  return useQuery({
    queryKey: ["features"],
    queryFn: async () => {
      const { data, error } = await supabase.from("features").select("*").order("category");
      if (error) throw error;
      return data as Feature[];
    },
  });
}

export function useBusinessFeatures() {
  return useQuery({
    queryKey: ["business_features"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_features").select("*");
      if (error) throw error;
      return data as { id: string; business_id: string; feature_key: string; enabled: boolean }[];
    },
  });
}

/** Feature availability for the active business (global switch + per-business override + parents). */
export function useEnabledFeatures() {
  const { data: business } = useActiveBusiness();
  const { data: features } = useFeatures();
  const { data: overrides } = useBusinessFeatures();

  const map = new Map((features ?? []).map((f) => [f.key, f]));
  const enabled = (key: string): boolean => {
    let cur = map.get(key);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.key)) {
      seen.add(cur.key);
      if (!cur.enabled_globally) return false;
      const o = (overrides ?? []).find(
        (x) => x.feature_key === cur!.key && x.business_id === business?.id,
      );
      if (o && !o.enabled) return false;
      cur = cur.depends_on ? map.get(cur.depends_on) : undefined;
    }
    return true;
  };

  return { enabled, features: features ?? [], loading: !features };
}
