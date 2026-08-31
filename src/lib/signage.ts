import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SIGNAGE_BUCKET = "signage-media";

export type AdType = "image" | "video" | "text" | "product" | "promotion";

export type SignageAd = {
  id: string;
  business_id: string;
  name: string;
  ad_type: AdType;
  title: string | null;
  description: string | null;
  media_url: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_size: number | null;
  product_id: string | null;
  promotion_id: string | null;
  category_id: string | null;
  use_live_data: boolean;
  offer_text: string | null;
  qr_url: string | null;
  show_qr: boolean;
  duration_seconds: number;
  use_full_video: boolean;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  days_of_week: number[];
  sort_order: number;
  status: "draft" | "active" | "inactive";
  display_count: number;
  last_displayed_at: string | null;
  created_at: string;
};

export type SignagePlaylist = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
};

export type SignagePlaylistItem = {
  id: string;
  business_id: string;
  playlist_id: string;
  ad_id: string;
  sort_order: number;
  enabled: boolean;
};

export type SignageDisplay = {
  id: string;
  business_id: string;
  name: string;
  location: string | null;
  playlist_id: string | null;
  pair_code: string;
  orientation: "landscape" | "portrait" | "auto";
  status: "active" | "revoked";
  paired_at: string | null;
  last_seen_at: string | null;
};

export type SignageSettings = {
  business_id: string;
  default_playlist_id: string | null;
  transition: "fade" | "slide" | "none";
  default_duration: number;
  video_autoplay: boolean;
  video_muted: boolean;
  loop_playlist: boolean;
  orientation: "landscape" | "portrait" | "auto";
  show_clock: boolean;
  show_business_name: boolean;
  show_logo: boolean;
};

export const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

export type UploadedMedia = { path: string; mime: string; size: number; duration?: number | undefined };

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.ceil(v.duration || 0));
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    v.src = url;
  });
}

/** Validates and uploads an advertisement image or video to secure storage. */
export async function uploadSignageMedia(file: File, businessId: string): Promise<UploadedMedia> {
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    throw new Error("Only JPG, PNG, WEBP images or MP4/WebM videos are supported");
  }
  if (isImage && file.size > MAX_IMAGE) throw new Error("Images must be smaller than 10MB");
  if (isVideo && file.size > MAX_VIDEO) throw new Error("Videos must be smaller than 200MB");

  const duration = isVideo ? await videoDuration(file) : undefined;
  if (isVideo && duration && duration > 600) throw new Error("Videos must be 10 minutes or shorter");

  const ext = file.name.split(".").pop()?.toLowerCase() || (isImage ? "jpg" : "mp4");
  const path = `${businessId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(SIGNAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  return { path, mime: file.type, size: file.size, duration };
}

export function useSignageMediaUrl(path?: string | null) {
  return useQuery({
    queryKey: ["signage-media-url", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(SIGNAGE_BUCKET)
        .createSignedUrl(path as string, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useSignageAds() {
  return useQuery({
    queryKey: ["signage_ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signage_ads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SignageAd[];
    },
  });
}

export function useSignagePlaylists() {
  return useQuery({
    queryKey: ["signage_playlists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("signage_playlists").select("*").order("name");
      if (error) throw error;
      return data as unknown as SignagePlaylist[];
    },
  });
}

export function usePlaylistItems(playlistId?: string | null) {
  return useQuery({
    queryKey: ["signage_playlist_items", playlistId],
    enabled: !!playlistId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signage_playlist_items")
        .select("*")
        .eq("playlist_id", playlistId as string)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as SignagePlaylistItem[];
    },
  });
}

export function useSignageDisplays() {
  return useQuery({
    queryKey: ["signage_displays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signage_displays")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SignageDisplay[];
    },
  });
}

export function useSignageSettings(businessId?: string | null) {
  return useQuery({
    queryKey: ["signage_settings", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signage_settings")
        .select("*")
        .eq("business_id", businessId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as SignageSettings | null;
    },
  });
}

export function useSaveSignageSettings(businessId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SignageSettings>) => {
      if (!businessId) throw new Error("Select a business first");
      const { error } = await supabase
        .from("signage_settings")
        .upsert({ business_id: businessId, ...patch } as never, { onConflict: "business_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signage_settings"] }),
  });
}

export function relativeTime(iso?: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** A display counts as online when it checked in within the last 3 minutes. */
export function isOnline(lastSeen?: string | null) {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 3 * 60 * 1000;
}
