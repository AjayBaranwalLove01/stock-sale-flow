import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveStorefront } from "@/lib/tenant.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // A business subdomain (abc.<base-domain>) lands on that business's storefront;
    // everything else goes to the back-office app.
    try {
      const host = window.location.hostname;
      const business = await resolveStorefront({ data: { host } });
      if (business?.subdomain) {
        throw redirect({ to: "/shop/$code", params: { code: business.subdomain } });
      }

    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
    }
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
