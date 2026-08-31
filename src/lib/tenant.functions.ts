import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const RESERVED = [
  "admin",
  "api",
  "www",
  "mail",
  "support",
  "help",
  "app",
  "login",
  "auth",
  "static",
  "assets",
  "cdn",
  "dev",
  "preview",
  "superadmin",
  "dashboard",
];

const subdomain = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])$/, "Use lowercase letters, numbers and hyphens only")
  .refine((v) => !RESERVED.includes(v), "That subdomain is reserved");

const businessInput = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(24),
  business_type: z.string().trim().max(60).optional().nullable(),
  subdomain,
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().max(80).default("India"),
  pincode: z.string().trim().max(12).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal("")),
  website: z.string().trim().max(200).optional().nullable(),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
  customer_site_enabled: z.boolean().default(true),
  admin_name: z.string().trim().min(2).max(120),
  admin_email: z.string().trim().email().max(160),
  admin_password: z.string().min(8).max(72),
});

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

async function assertSuperAdmin(supabase: {
  from: (t: "user_roles") => {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
    };
  };
}, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Super Admin: create a business plus its initial Business Admin account. */
export const createBusinessWithAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { admin_name, admin_email, admin_password, ...biz } = data;
    const { data: created, error } = await supabaseAdmin
      .from("businesses")
      .insert({
        name: biz.name,
        code: biz.code,
        subdomain: biz.subdomain,
        business_type: biz.business_type ?? null,
        address: biz.address ?? null,
        city: biz.city ?? null,
        state: biz.state ?? null,
        country: biz.country,
        pincode: biz.pincode ?? null,
        phone: biz.phone ?? null,
        email: biz.email || null,
        website: biz.website ?? null,
        status: biz.status,
        customer_site_enabled: biz.customer_site_enabled,
        created_by: context.userId,
      })
      .select("id, name")
      .single();

    if (error) throw new Error(error.message);

    const { data: user, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true,
      user_metadata: { full_name: admin_name, business_id: created.id, account_type: "staff" },
    });
    if (uErr || !user.user) {
      await supabaseAdmin.from("businesses").delete().eq("id", created.id);
      throw new Error(uErr?.message ?? "Could not create the business admin");
    }

    await supabaseAdmin.from("profiles").upsert({
      id: user.user.id,
      full_name: admin_name,
      email: admin_email,
      business_id: created.id,
      account_type: "staff",
    });
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: user.user.id, role: "admin", business_id: created.id });
    await supabaseAdmin.from("business_settings").insert({
      business_id: created.id,
      business_name: created.name,
      state: biz.state ?? null,
      address: biz.address ?? null,
      phone: biz.phone ?? null,
      email: biz.email || null,
    });
    await supabaseAdmin.from("audit_logs").insert({
      business_id: created.id,
      user_id: context.userId,
      module: "Businesses",
      action: "Business Created",
      record_id: created.id,
      new_value: { name: created.name, subdomain: biz.subdomain },
    });

    return { id: created.id };
  });

/** Super Admin: reset the password of a staff account in any business. */
export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Business Admin / Super Admin: add a staff member to the active business. */
export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(160),
        password: z.string().min(8).max(72),
        role: z.enum(["admin", "billing_user", "inventory_user"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: businessId } = await context.supabase.rpc("current_business_id");
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("super_admin") && !roles.includes("admin")) throw new Error("Forbidden");
    if (!businessId) throw new Error("No active business selected");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        business_id: businessId,
        account_type: "staff",
      },
    });
    if (error || !user.user) throw new Error(error?.message ?? "Could not create the user");

    await supabaseAdmin.from("profiles").upsert({
      id: user.user.id,
      full_name: data.full_name,
      email: data.email,
      business_id: businessId,
      account_type: "staff",
    });
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: user.user.id, role: data.role, business_id: businessId });
    return { id: user.user.id };
  });

/** Public: resolve a storefront tenant from a hostname or business code. */
export const resolveStorefront = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ host: z.string().max(255).optional(), code: z.string().max(64).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let slug = data.code?.trim().toLowerCase() ?? "";
    if (!slug && data.host) {
      const host = data.host.split(":")[0]!.toLowerCase();
      const base = (process.env["STOREFRONT_BASE_DOMAIN"] ?? "").toLowerCase();
      if (base && host.endsWith(`.${base}`)) slug = host.slice(0, -(base.length + 1));
      if (slug.includes(".")) slug = slug.split(".")[0]!;
    }
    if (!slug || RESERVED.includes(slug)) return null;

    const { data: biz } = await supabase
      .from("storefront_businesses")
      .select("id, name, code, subdomain, logo_url, city, state, country, phone, email, business_type")
      .or(`subdomain.eq.${slug},code.eq.${slug.toUpperCase()}`)
      .maybeSingle();
    return biz ?? null;
  });

/**
 * Creates the profile row (and, for shoppers, the customer record) for the
 * signed-in user. The very first staff account on the platform becomes Super Admin.
 */
export const bootstrapAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();
    if (existing) return { created: false };

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const meta = (authUser.user?.user_metadata ?? {}) as Record<string, unknown>;
    const accountType = meta["account_type"] === "customer" ? "customer" : "staff";
    const businessId = typeof meta["business_id"] === "string" ? meta["business_id"] : null;
    const fullName = typeof meta["full_name"] === "string" ? meta["full_name"] : "";

    await supabaseAdmin.from("profiles").insert({
      id: context.userId,
      full_name: fullName,
      email: authUser.user?.email ?? null,
      business_id: businessId,
      account_type: accountType,
    });

    if (accountType === "staff") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true });
      if (!count) {
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: context.userId, role: "super_admin" });
      }
    } else if (businessId) {
      await supabaseAdmin.from("customers").insert({
        business_id: businessId,
        name: fullName || "Customer",
        email: authUser.user?.email ?? null,
        auth_user_id: context.userId,
        source: "storefront",
      });
    }

    return { created: true };
  });
