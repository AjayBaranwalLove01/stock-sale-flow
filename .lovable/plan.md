# Products in multiple categories

Today every product sits in exactly one category. This change lets one product appear in as many categories as you like — without ever duplicating the product, its stock, price, barcode or history.

## How it will work

**One product, many categories.** A product keeps a single "primary category" (used for SKU suggestions, reports and existing screens) and can additionally be listed in any number of other categories. Adding or removing a category never touches stock, pricing or transactions.

**New mapping records.** A new mapping list records "this product is in this category". Each business only ever sees its own mappings; the same access rules already used everywhere else apply unchanged, including Super Admin visibility. The same product can't be added to the same category twice — the attempt is ignored with a small "already mapped" note.

**Existing data is preserved.** Every current product/category assignment is copied into the new mapping list as part of the change, and the existing category field stays on the product as its primary category, so nothing currently working can break.

## Screens

**New "Category Mapping" page** (sidebar, under Catalog):
- Left: category tree with a live product count per category, searchable.
- Right: product list with search and filters for All / Mapped / Unmapped / In a specific category.
- Drag one product, or tick several and drag the selection, onto a category to map them. Drop zones highlight on hover.
- Each product row shows its categories as removable chips; an "x" on the chip unmaps it.
- Bulk action button "Assign selected to category" for touch/mobile where dragging is awkward.
- Counts, chips and lists update immediately — no page refresh. Toasts confirm ("3 products mapped to Grocery").

**Product add/edit popup:** the existing step-1 category picker stays as the primary category, plus a new multi-select list of additional categories with checkboxes. Saving writes both.

**Category page:** each row expands to show the products mapped to it (name, SKU, status) with a remove action, and the product count already shown stays accurate under the new mapping.

**Customer storefront:** filtering by a category shows products mapped to it or to any of its subcategories, through either the primary category or an extra mapping, with no duplicates.

## Performance

Mapping lookups are indexed by product, category and business. The mapping page loads the product list in pages and only the mappings for the visible products; search boxes are debounced.

## Audit

Every mapping added or removed is written to the existing activity log with the product, the category, the action, the user, the business and the time.

## Technical notes

- Migration creates `public.product_categories` (`id`, `business_id`, `product_id`, `category_id`, `created_at`, `updated_at`) with `UNIQUE (business_id, product_id, category_id)`, indexes on `product_id`, `category_id`, `business_id`, GRANTs for `authenticated`/`service_role` plus `SELECT` for `anon` (storefront), RLS mirroring `can_access_business(business_id)`, and the standard `updated_at` trigger.
- Backfill: `INSERT INTO product_categories (business_id, product_id, category_id) SELECT business_id, id, category_id FROM products` in the same migration. `products.category_id` is retained as the primary category — no destructive change, so no existing query, RPC, import, promotion, signage or report breaks.
- A trigger on `products` keeps the primary category mirrored into `product_categories` on insert/update, so mappings can never drift.
- Storefront reads: extend `useStoreProducts`/`storefront_products` consumption with a `product_categories` fetch, and match on `category_id ∈ selectedSet OR mapped ∈ selectedSet`, de-duplicated by product id.
- New route `src/routes/_authenticated/category-mapping.tsx` using HTML5 drag-and-drop (no new dependency), shadcn Card/Badge/Input/Checkbox, sonner toasts, and React Query invalidation for instant updates.
- Shared hooks `useProductCategories`, `useMapProducts`, `useUnmapProduct` added to `src/lib/queries.ts`, each calling `logAudit("Categories", "Product Mapped"/"Product Unmapped", …)`.
