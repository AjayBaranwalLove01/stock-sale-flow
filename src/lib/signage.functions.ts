import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const SIGNAGE_BUCKET = "signage-media";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type DisplayItem = {
  id: string;
  type: "image" | "video" | "text" | "product" | "promotion";
  name: string;
  title: string | null;
  description: string | null;
  media_url: string | null;
  offer_text: string | null;
  duration: number;
  use_full_video: boolean;
  show_qr: boolean;
  qr_url: string | null;
  start_time: string | null;
  end_time: string | null;
  days_of_week: number[];
  product: {
    name: string;
    description: string | null;
    mrp: number;
    price: number;
    discount: number;
    unit: string;
    image: string | null;
    in_stock: boolean;
  } | null;
  promotion: {
    title: string;
    description: string | null;
    discount_type: string;
    discount_value: number;
  } | null;
};

export type DisplayContent = {
  display: { id: string; name: string; orientation: string };
  business: { name: string; subdomain: string; logo_url: string | null };
  settings: {
    transition: "fade" | "slide" | "none";
    default_duration: number;
    video_muted: boolean;
    video_autoplay: boolean;
    loop_playlist: boolean;
    orientation: "landscape" | "portrait" | "auto";
    show_clock: boolean;
    show_business_name: boolean;
    show_logo: boolean;
  };
  items: DisplayItem[];
};

/** Pair a physical screen using the short code shown in the admin panel. */
export const pairDisplay = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: String(d.code ?? "").trim().toUpperCase() }))
  .handler(async ({ data }) => {
    if (data.code.length < 4) throw new Error("Enter the display code from your admin panel");
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("signage_pair_display", { p_code: data.code });
    if (error) throw new Error(error.message);
    const row = (rows as unknown as { token: string; display_name: string; business_name: string }[])?.[0];
    if (!row) throw new Error("Invalid display code");
    return row;
  });

/** Content for one paired screen. Media paths are exchanged for short-lived signed links. */
export const getDisplayContent = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }): Promise<DisplayContent> => {
    const sb = publicClient();
    const { data: content, error } = await sb.rpc("signage_display_content", { p_token: data.token });
    if (error) throw new Error(error.message);
    const payload = content as unknown as DisplayContent;

    const paths = new Set<string>();
    for (const it of payload.items ?? []) {
      if (it.media_url) paths.add(it.media_url);
      if (it.product?.image) paths.add(it.product.image);
    }
    if (paths.size) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const list = Array.from(paths);
      const media = list.filter((p) => !p.startsWith("http"));
      const signed = new Map<string, string>();
      const signIn = async (bucket: string, items: string[]) => {
        if (!items.length) return;
        const { data: urls } = await supabaseAdmin.storage.from(bucket).createSignedUrls(items, 3600);
        for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
      };
      await signIn(SIGNAGE_BUCKET, media);
      // Product images live in the catalogue bucket.
      const missing = media.filter((p) => !signed.has(p));
      await signIn("catalog-images", missing);

      for (const it of payload.items ?? []) {
        if (it.media_url && signed.has(it.media_url)) it.media_url = signed.get(it.media_url)!;
        if (it.product?.image && signed.has(it.product.image)) it.product.image = signed.get(it.product.image)!;
      }
    }
    return payload;
  });

export const displayHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }) => {
    await publicClient().rpc("signage_heartbeat", { p_token: data.token });
    return { ok: true };
  });

export const logDisplayPlay = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; adId: string }) => ({
    token: String(d.token ?? ""),
    adId: String(d.adId ?? ""),
  }))
  .handler(async ({ data }) => {
    await publicClient().rpc("signage_log_play", { p_token: data.token, p_ad_id: data.adId });
    return { ok: true };
  });
