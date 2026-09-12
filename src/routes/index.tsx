import { createFileRoute, redirect } from "@tanstack/react-router";

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
  head: () => ({
    meta: [
      { title: "Online Store — Browse Products" },
      {
        name: "description",
        content: "Browse products, add items to your cart and place an order online.",
      },
      { property: "og:title", content: "Online Store — Browse Products" },
      {
        property: "og:description",
        content: "Browse products, add items to your cart and place an order online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    // A business subdomain (abc.<base-domain>) lands on that business's storefront;
    // everything else goes to the back-office app.
    const slug = hostSlug(window.location.hostname);
    if (slug) {
      // Route public storefront hosts without depending on a server lookup. The
      // storefront itself validates the business and shows an unavailable page
      // when the slug is unknown, rather than exposing the staff sign-in page.
      throw redirect({ to: "/shop/$code", params: { code: slug } });
    }
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
