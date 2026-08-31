# Multi-Business Stock Keeper + Storefront

Turning the existing Ledger ERP (Ajay Traders) into a multi-tenant platform with a Super Admin, per-business admins, subdomain storefronts, and feature flags. Existing modules and seeded data are preserved — the current data becomes "Business #1".

This is large, so it ships in phases. Each phase leaves the app working.

## Phase 1 — Tenancy foundation (backend)

- New `businesses` table: name, code, business_type, subdomain (unique, lowercase, reserved-word blocked), logo, address/city/state/country/pincode, phone, email, website, status (active/inactive/suspended), `customer_site_enabled`, timestamps.
- Add `business_id` to every business-scoped table: profiles, user_roles, categories, products, customers, suppliers, purchases + items, sales + items, returns, payments, inventory_transactions, stock_adjustments, audit_logs, business_settings, catalog_images.
- Backfill: create "Ajay Traders" from the existing `business_settings` row and stamp all existing rows with its id. Nothing is lost.
- Security helpers (SECURITY DEFINER): `current_business_id()`, `is_super_admin()`, extend `has_role`.
- Rewrite every RLS policy to `business_id = current_business_id() OR is_super_admin()`. Server never trusts a client-supplied business id. Existing RPCs (`create_sale`, `create_purchase`, returns, `adjust_stock`) get business stamping and cross-tenant guards.
- Role enum extended: `super_admin`, `business_admin` (maps existing `admin`), `billing_user`, `inventory_user`, plus `customer` for storefront shoppers.

## Phase 2 — Super Admin console

- `/admin/businesses`: list, create, edit, activate/deactivate/suspend.
- Create-business flow also creates the initial Business Admin (email + temp password) bound to that business.
- Business switcher in the header, visible only to Super Admin ("All Businesses" + each business). Sets a server-verified impersonation context.
- `/admin/features`: global + per-business feature flags (storefront, promotions, orders, reports, etc.) with dependency rules; disabled features are hidden in UI *and* rejected at the backend.
- Global audit log view across businesses.

## Phase 3 — Existing ERP made business-aware

- All current pages read/write inside the active business automatically; no per-page business pickers.
- Business Settings page becomes per-business; Users page scoped to the business.
- Dashboard/reports filtered by business; Super Admin sees aggregates when in "All Businesses".

## Phase 4 — Storefront

- Tenant resolution from hostname: `abc.<base-domain>` → business lookup → storefront context. Base domain from config, never hardcoded. Local/preview fallback via `?b=<code>` path so it is testable without wildcard DNS.
- Public storefront: home, category browse, product listing with search/filter/sort, product detail, promotions, cart (guest-allowed).
- Customer registration/login required at checkout; customers are scoped to the business.
- Checkout creates an order that consumes stock through the existing inventory engine — Stock Keeper stays the source of truth.
- Storefront returns 404/disabled page when the business is inactive/suspended or its customer site is off (global or per-business).

## Phase 5 — Orders in admin + hardening

- Orders module for business staff: list, detail, status transitions, fulfil/cancel with stock restore.
- Promotions module.
- Cross-tenant penetration checks (ID tampering on products, customers, orders, payloads), storefront isolation checks, feature-flag bypass checks, and a security scan.

## Technical notes

- Isolation is enforced in Postgres RLS plus authenticated server functions; the frontend never filters for security.
- Subdomain is identification only, never authorization.
- Migrations are additive and backfilled, so existing seeded data keeps working throughout.
