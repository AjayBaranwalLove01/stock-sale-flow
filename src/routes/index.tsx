import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveStorefront } from "@/lib/tenant.functions";

const NON_STORE_HOSTS = ["www", "app", "admin", "localhost", "id-preview", "preview"];

/** First label of the hostname, when it looks like a business subdomain. */
function hostSlug(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === "localhost" || /^\d+(\.\d+)*$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 3) return null; // apex domain, no subdomain
  const slug = parts[0]!;
  if (!slug || NON_STORE_HOSTS.includes(slug)) return null;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return null;
  return slug;
}

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // A business subdomain (abc.<base-domain>) lands on that business's storefront;
    // everything else goes to the back-office app.
    try {
      const host = window.location.hostname;
      const slug = hostSlug(host);
      const business = await resolveStorefront({
        data: slug ? { host, code: slug } : { host },
      });
      if (business?.subdomain) {
        throw redirect({ to: "/shop/$code", params: { code: business.subdomain } });
      }
      if (slug) {
        // Subdomain we could not resolve: still show shopping, never a login wall.
        throw redirect({ to: "/shop" });
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
    }
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
