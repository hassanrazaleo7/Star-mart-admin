# Storefront brief: product expiry ("best before")

> **How to use this file:** paste it as the prompt for the coding agent working on the **Star Mart customer storefront** (a Next.js App Router app). It is self-contained: database tables, the exact queries, the API routes to create in the storefront, the business rules and the UI. You do not need access to the admin repository.

---

## 1. Context

Star Mart runs two Next.js apps on **one shared Postgres (Neon) database**:

| App | Owns | Role |
|---|---|---|
| **Star Mart Admin** (back office + POS, separate repo) | Postgres schema **`star_mart`** | Manages catalogue, prices and stock. Stock is tracked in **batches (lots)**, each with its own expiry date, and sold earliest-expiry first (FEFO). |
| **Storefront** (this app) | Postgres schema `public` | Customer-facing shop. |

**Strategy:**
- The storefront does **not** call the admin app.
- It creates **its own API routes and server-side queries** that read the admin's `star_mart` tables **read-only**, directly from the shared database.
- All expiry logic below must be reproduced exactly, so the shop and the till agree on what can be sold.

**Goal of this task:**
- Build the storefront's data layer and API routes for products with expiry information.
- Show best-before information in the UI.
- Never offer expired stock.
- Enforce sellable quantities in the cart and at checkout.

---

## 2. Database access (read-only)

### 2.1 Connection

Ask the store owner to create a read-only role in the shared database once:

```sql
create role storefront_ro login password '<strong password>';
grant usage on schema star_mart to storefront_ro;
grant select on star_mart.products, star_mart.categories, star_mart.stock_batches, star_mart.store_settings to storefront_ro;
```

Add it to the storefront's environment (server-only, never `NEXT_PUBLIC_`):

```bash
CATALOG_DATABASE_URL=postgresql://storefront_ro:<password>@<neon-host>/<db>?sslmode=require
```

Rules:
- **Never write to `star_mart`.** Stock, batches and prices change only through the admin app, which keeps several tables consistent in one transaction.
- **If the storefront uses drizzle-kit**, its config must ignore the admin schema, or a migration could try to drop the admin tables. Set `schemaFilter: ["public"]` in `drizzle.config.ts`, and keep the `star_mart` table definitions below out of the files drizzle-kit generates from (for example in `lib/catalog/schema.ts`, not in the migration schema).
- Query only from server code: Route Handlers, Server Components, Server Actions. Use `@neondatabase/serverless` with `drizzle-orm/neon-http`, or plain `neon()` tagged SQL.

### 2.2 Tables you read (columns you need)

All tables live in the schema `star_mart`. Money is integer **paisa** (1 PKR = 100 paisa). Quantities are `numeric(12,3)`, so cast them to numbers.

**`star_mart.products`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `sku` | text | unique, upper-case |
| `barcode` | text null | |
| `name`, `description`, `brand` | text | |
| `category_id` | uuid null | → `categories.id` |
| `unit` | text | pcs, kg, g, l, ml, pack, box, dozen |
| `allow_fractional` | boolean | true → quantities may have up to 3 decimals |
| `price_paisa` | bigint | **tax-inclusive** shelf price |
| `tax_rate_bps` | integer | 1700 = 17% |
| `reorder_level` | numeric | low-stock threshold |
| `stock_qty` | numeric | total on hand, **including expired units** |
| `image_url` | text null | |
| `status` | enum | `active` \| `draft` \| `archived`. **Only show `active`.** |
| `tracks_expiry` | boolean | perishable product |
| `shelf_life_days` | integer null | typical shelf life |
| `expiry_warning_days` | integer null | per-product "expiring soon" window (null → store default) |
| `created_at`, `updated_at` | timestamptz | |

Never select or expose `cost_paisa`, `supplier_id`, `created_by` or other internal columns.

**`star_mart.stock_batches`**: one row per received lot.

| Column | Type | Notes |
|---|---|---|
| `product_id` | uuid | |
| `expiry` | date null | store-local calendar day; null = does not expire |
| `qty_remaining` | numeric | ≥ 0; only rows with `qty_remaining > 0` matter |

**`star_mart.categories`**: `id`, `name`, `is_active`.

**`star_mart.store_settings`**: `key text`, `value jsonb`. Read these keys, and fall back to the defaults when a key or field is missing:

| key | field | default | meaning |
|---|---|---|---|
| `store` | `timezone` | `"Asia/Karachi"` | timezone that defines "today" |
| `currency` | `code` | `"PKR"` | |
| `stock` | `expiryWarningDays` | `30` | default "expiring soon" window |
| `stock` | `storefrontHideWithinDays` | `0` | units expiring within N days are not offered online (0 = hide only expired units) |

### 2.3 Drizzle definitions (read-only mirror, `lib/catalog/schema.ts`)

```ts
import { bigint, boolean, date, integer, jsonb, numeric, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Owned by Star Mart Admin. READ-ONLY here; never migrate or write.
const sm = pgSchema("star_mart");
const qty = (n: string) => numeric(n, { precision: 12, scale: 3, mode: "number" });

export const smProducts = sm.table("products", {
  id: uuid("id").primaryKey(),
  sku: text("sku").notNull(),
  barcode: text("barcode"),
  name: text("name").notNull(),
  description: text("description"),
  brand: text("brand"),
  categoryId: uuid("category_id"),
  unit: text("unit").notNull(),
  allowFractional: boolean("allow_fractional").notNull(),
  pricePaisa: bigint("price_paisa", { mode: "number" }).notNull(),
  taxRateBps: integer("tax_rate_bps").notNull(),
  reorderLevel: qty("reorder_level").notNull(),
  stockQty: qty("stock_qty").notNull(),
  imageUrl: text("image_url"),
  status: text("status").$type<"active" | "draft" | "archived">().notNull(),
  tracksExpiry: boolean("tracks_expiry").notNull(),
  shelfLifeDays: integer("shelf_life_days"),
  expiryWarningDays: integer("expiry_warning_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const smStockBatches = sm.table("stock_batches", {
  id: uuid("id").primaryKey(),
  productId: uuid("product_id").notNull(),
  expiry: date("expiry", { mode: "string" }),
  qtyRemaining: qty("qty_remaining").notNull(),
});

export const smCategories = sm.table("categories", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull(),
});

export const smStoreSettings = sm.table("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
});
```

---

## 3. Expiry rules (must match the admin exactly)

1. **Calendar days, store timezone.**
   - `today` = the current date in `store.timezone`: `new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())` gives `YYYY-MM-DD`.
   - A batch is sellable **through** its expiry date and expired from the next day: `expired ⇔ expiry < today`.
2. **Cutoff for the shop:** `cutoff = today + storefrontHideWithinDays` days. A batch is **sellable online** when `expiry IS NULL OR expiry >= cutoff`.
3. **Sellable quantity:**
   ```
   sellableBatched = Σ qty_remaining of sellable batches
   allBatched      = Σ qty_remaining of all open batches
   unbatched       = max(0, stock_qty − allBatched)    -- old stock not in any batch counts as sellable
   sellableQty     = max(0, min(stock_qty, sellableBatched + unbatched))
   ```
4. **Nearest expiry (what the customer receives, FEFO):** `nearestExpiry = MIN(expiry)` over sellable batches with a date. If several batches are needed for the quantity, later ones follow in date order.
5. **Status**, with `warn = products.expiry_warning_days ?? stock.expiryWarningDays` and `days = nearestExpiry − today`:
   - no date, or `sellableQty = 0` → `"none"`
   - `days < 0` → `"expired"` (cannot happen for sellable stock, but handle it)
   - `days <= warn` → `"expiring_soon"`
   - otherwise → `"fresh"`
6. **Unavailable reason** when `sellableQty = 0`:
   - `stock_qty > 0` → `"expired"`: units are on hand but none sellable. Show customers "Temporarily unavailable"; never say "expired".
   - otherwise → `"out_of_stock"`.
7. **Low stock:** `sellableQty > 0 && reorder_level > 0 && sellableQty <= reorder_level`.
8. **Quantities:** whole numbers unless `allow_fractional` (then steps of 0.001). Always `0 < qty ≤ sellableQty`.
9. **Prices are tax-inclusive.** Use `price_paisa` for maths. Format `(paisa / 100).toFixed(2)` with the currency.

Put rules 1–7 in **pure functions** in `lib/catalog/expiry.ts` (`storeToday`, `addDays`, `daysUntil`, `expiryStatus`, `bestBeforeLabel`) and unit-test them. Do date arithmetic on `YYYY-MM-DD` strings with UTC (`new Date(iso + "T00:00:00Z")`, `setUTCDate`); never in local time.

`bestBeforeLabel(nearestExpiry, days, status)`:
- days = 0 → `"Best before today"`
- days = 1 → `"Best before tomorrow"`
- `expiring_soon` → `"Best before 6 Nov 2026 (9 days)"`
- `fresh` → `"Best before 6 Nov 2026"`
- otherwise → `null`

Format dates with `Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })`.

---

## 4. Queries (`lib/catalog/queries.ts`, `import "server-only"`)

Load the settings once per request with React `cache()`:

```sql
select key, value from star_mart.store_settings where key in ('store', 'currency', 'stock');
```

Compute `today` and `cutoff` in TypeScript, then pass them as parameters.

**Product list** (one round trip; `$1` = cutoff, `$2` = today, `$3` = default warning days):

```sql
select p.id, p.sku, p.barcode, p.name, p.description, p.brand, p.unit, p.allow_fractional,
       p.price_paisa, p.tax_rate_bps, p.reorder_level::float8 as reorder_level, p.stock_qty::float8 as stock_qty,
       p.image_url, p.tracks_expiry, p.shelf_life_days, p.expiry_warning_days, p.updated_at,
       c.id as category_id, c.name as category_name,
       greatest(0, least(p.stock_qty, b.sellable_batched + greatest(0, p.stock_qty - b.all_batched)))::float8 as sellable_qty,
       b.nearest_expiry::text as nearest_expiry
from star_mart.products p
left join star_mart.categories c on c.id = p.category_id
left join lateral (
  select coalesce(sum(qty_remaining) filter (where expiry is null or expiry >= $1::date), 0) as sellable_batched,
         coalesce(sum(qty_remaining), 0)                                                    as all_batched,
         min(expiry) filter (where expiry >= $1::date)                                       as nearest_expiry
  from star_mart.stock_batches
  where product_id = p.id and qty_remaining > 0
) b on true
where p.status = 'active'
  -- optional filters:
  -- and (p.name ilike $q or p.brand ilike $q or p.sku ilike $q or p.barcode = $raw)
  -- and p.category_id = $category
  -- inStock:      and greatest(0, least(p.stock_qty, b.sellable_batched + greatest(0, p.stock_qty - b.all_batched))) > 0
  -- expiringSoon: and <inStock condition> and b.nearest_expiry <= $2::date + coalesce(p.expiry_warning_days, $3)
order by p.name, p.id            -- see sorts below
limit $limit offset $offset;
```

Sorts:

| Sort | `order by` |
|---|---|
| `name` | `p.name` |
| `price_asc` | `p.price_paisa, p.name` |
| `price_desc` | `p.price_paisa desc, p.name` |
| `newest` | `p.created_at desc` |
| `expiry` | `b.nearest_expiry asc nulls last, p.name` |

Always append `p.id` as a tiebreaker. Get the total with `count(*)` over the same `from`/`where`.

**Single product** (by id, or by SKU via `upper($sku)`): the same select with `p.id = $id` or `p.sku = upper($sku)`. Then the sellable batches:

```sql
select expiry::text as expiry, sum(qty_remaining)::float8 as qty
from star_mart.stock_batches
where product_id = $id and qty_remaining > 0 and (expiry is null or expiry >= $cutoff::date)
group by expiry
order by expiry asc nulls last;
```

**Categories:**

```sql
select c.id, c.name, count(p.id)::int as product_count
from star_mart.categories c
left join star_mart.products p on p.category_id = c.id and p.status = 'active'
where c.is_active
group by c.id, c.name
order by c.name;
```

Map every row to the `CatalogProduct` shape in §5 with one `toProduct(row, ctx)` function, which applies the rules in §3.

---

## 5. API routes to create in the storefront

Server Components call `lib/catalog/queries.ts` **directly**: never fetch your own API from the server. The routes below exist for client components (cart drawer, search-as-you-type), for checkout validation and for other consumers.

| Route | Purpose |
|---|---|
| `GET /api/catalog/products` | List. Query: `q` (≤100), `category` (uuid), `inStock=1`, `expiringSoon=1`, `sort` = `name\|price_asc\|price_desc\|newest\|expiry` (default `name`), `page` (≥1), `pageSize` (1–100, default 24). Validate with zod; return 400 `{ error: "invalid_query" }` on bad input. |
| `GET /api/catalog/products/[sku]` | One active product plus `batches`, or 404 `{ error: "not_found" }`. Also accept a UUID. |
| `GET /api/catalog/expiring` | Shortcut for `inStock=1&expiringSoon=1&sort=expiry` (the "Use soon" deals page). |
| `GET /api/catalog/categories` | Active categories with `productCount`. |
| `POST /api/cart/validate` | Body `{ lines: { sku: string; qty: number; pricePaisa?: number; nearestExpiry?: string \| null }[] }` (max 100 lines). For each line it returns `{ sku, ok, product: CatalogProduct \| null, qty, issues }`. `qty` is clamped to `sellableQty`. `issues` is any of `"not_found"`, `"unavailable"`, `"qty_reduced"`, `"price_changed"`, `"expiry_earlier"`, `"fractional_not_allowed"`. Always computed live. |

Caching:
- Catalogue GETs: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. For Server Components, wrap the list and detail queries in Next's cache with a 60-second lifetime and tag `"catalog"`.
- `POST /api/cart/validate` and checkout are **never cached** (`dynamic = "force-dynamic"`, `Cache-Control: no-store`).

Errors are always JSON in the shape `{ error, message? }`. Log database errors server-side, and never leak SQL or connection strings.

### 5.1 Response shapes

```ts
export type ExpiryStatus = "expired" | "expiring_soon" | "fresh" | "none";

export type CatalogProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string;
  allowFractional: boolean;
  category: { id: string; name: string } | null;
  imageUrl: string | null;
  price: { amountPaisa: number; amount: string; currency: string; taxRateBps: number; taxInclusive: true };
  stock: { sellableQty: number; inStock: boolean; lowStock: boolean; unavailableReason: "out_of_stock" | "expired" | null };
  expiry: {
    tracksExpiry: boolean;
    nearestExpiry: string | null; // YYYY-MM-DD; null when nothing sellable is dated
    daysToExpiry: number | null;
    status: ExpiryStatus;
    label: string | null;         // bestBeforeLabel()
    shelfLifeDays: number | null;
  };
  updatedAt: string;
};
export type CatalogBatch = { expiry: string | null; qty: number; status: ExpiryStatus };
export type CatalogProductDetail = CatalogProduct & { batches: CatalogBatch[] };
export type CatalogPage = {
  data: CatalogProduct[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  meta: { today: string; timezone: string; currency: string; expiryWarningDays: number; hideWithinDays: number };
};
```

Example list item (from real demo data, today = 2026-10-28):

```json
{
  "id": "8e0c7a95-c354-4c8f-80db-346c30b4ec71",
  "sku": "MILK-1L",
  "name": "Full Cream Milk 1 L",
  "unit": "pcs",
  "allowFractional": false,
  "category": { "id": "03145e77-7e61-4288-a518-9e240db9191f", "name": "Dairy" },
  "price": { "amountPaisa": 26500, "amount": "265.00", "currency": "PKR", "taxRateBps": 0, "taxInclusive": true },
  "stock": { "sellableQty": 75, "inStock": true, "lowStock": false, "unavailableReason": null },
  "expiry": { "tracksExpiry": true, "nearestExpiry": "2026-10-30", "daysToExpiry": 2, "status": "expiring_soon", "label": "Best before 30 Oct 2026 (2 days)", "shelfLifeDays": 7 }
}
```

A product whose only stock is expired:

```json
{
  "stock": { "sellableQty": 0, "inStock": false, "lowStock": false, "unavailableReason": "expired" },
  "expiry": { "tracksExpiry": true, "nearestExpiry": null, "daysToExpiry": null, "status": "none", "label": null, "shelfLifeDays": 120 },
  "batches": []
}
```

Detail `batches` for a product with two lots: `[{ "expiry": "2026-11-06", "qty": 21, "status": "expiring_soon" }, { "expiry": "2026-11-09", "qty": 24, "status": "expiring_soon" }]`.

---

## 6. UI to build

### 6.1 Shared components

| Component | Behaviour |
|---|---|
| `<ExpiryBadge expiry stock compact? />` | `expiring_soon` → amber pill "Best before 6 Nov" (short date; full `label` in a tooltip/`title`), "Best before today", or "…tomorrow". `fresh` → nothing in compact mode, "Best before 12 Mar 2027" in full mode. `none` → nothing. Wrap the date in `<time dateTime="2026-11-06">`. |
| `<StockStatus stock />` | "In stock", "Only N left" (`lowStock`), "Out of stock", or "Temporarily unavailable" (`unavailableReason === "expired"`). |
| `<QuantityInput product />` | Step 1, or 0.001 for fractional products (presets such as 0.25 / 0.5 kg are fine). Max = `sellableQty`. Says "Max N available" in an `aria-live="polite"` region. |

Badges always carry text and never rely on colour alone.

### 6.2 Listing, category and search pages
- Show a compact `ExpiryBadge` for `expiring_soon` items on cards, and `StockStatus` for unavailable or low-stock items.
- Add a **"Best before"** sort (`sort=expiry`), a **"Use soon"** filter chip (`expiringSoon=1`) and an **"In stock only"** toggle (`inStock=1`, on by default for search). Keep all of them in the URL search params.
- Add a page `/deals/use-soon` listing `inStock=1&expiringSoon=1&sort=expiry`.
- Unavailable products stay visible (greyed, add-to-cart disabled) unless "In stock only" is on.

### 6.3 Product page (`/products/[sku]`)
- Fetch the detail with the query function, and use `notFound()` when it is missing.
- Under the price, show:
  - `StockStatus`
  - for `tracksExpiry` products with stock: **"Best before {date}"** and the helper text "Date shown is for the item you will receive. Larger quantities may include later dates."
  - when there are several batches, an expandable **"Available dates"** list, e.g. "21 × best before 6 Nov · 24 × best before 9 Nov".
- When the chosen quantity exceeds the first batch, show the FEFO split: "21 best before 6 Nov, 4 best before 9 Nov".
- With no stock and a `shelfLifeDays` value, you may show "Typical shelf life: N days".
- Add schema.org Product JSON-LD with `offers.availability` (`InStock` / `OutOfStock`).

### 6.4 Cart
- Store `sku`, `qty` and a snapshot of `pricePaisa` and `nearestExpiry` per line.
- On cart page load, and when the drawer opens, call `POST /api/cart/validate` and apply the result:
  - `not_found` or `unavailable` → "No longer available": excluded from totals, with a Remove button.
  - `qty_reduced` → clamp the line and show "Only N available, quantity updated".
  - `price_changed` → update the price and show "Price updated".
  - `expiry_earlier` → show the new best-before badge.
- Show an `ExpiryBadge` on every `expiring_soon` line.

### 6.5 Checkout
- Re-run the validation **server-side**, in the same server action that places the order, and block submission when anything changed so the customer can review.
- Show the notice "Some items have a short best-before date: …" when any line is `expiring_soon`.
- The admin does not reserve stock for online orders. Keep the storefront's existing order flow, and do not decrement `star_mart` stock (it is read-only). If there is no order flow yet, stop at a validated cart with a "Continue" placeholder.

### 6.6 Resilience
- Database errors on listing or product pages: serve cached data when available; otherwise show a friendly error state with Retry. Never crash.
- A failure during checkout validation **blocks** checkout with "We could not confirm stock right now, please try again".

---

## 7. Acceptance criteria

1. Expired stock is never orderable: a product with only expired units shows "Temporarily unavailable", add-to-cart is disabled, and the cart and checkout reject it.
2. `sellableQty`, `nearestExpiry` and `status` match the rules in §3 for every product. Compare against the admin's Expiry page.
3. Best-before dates match the database date exactly, in any browser timezone (no off-by-one).
4. The "Best before" sort, the "Use soon" filter and "In stock only" work and are reflected in the URL.
5. Cart quantities never exceed `sellableQty`, and checkout re-validates live.
6. Nothing in the storefront writes to `star_mart`. The database role only has `SELECT`, and drizzle-kit ignores the schema.
7. `CATALOG_DATABASE_URL` never reaches the browser bundle.
8. Lighthouse accessibility ≥ 95 on listing and product pages.

---

## 8. Test plan

**Unit tests:**
- `expiryStatus`: boundary days 0, 1, the warning window, and the day after.
- `addDays` across month and year ends, and the leap day.
- `sellableQty`: unbatched stock, the hide window, all-expired stock.
- `bestBeforeLabel`.
- The cart-validation mapper.

**Demo data** (the admin's `npm run seed:demo` creates these):

| SKU | Situation | Expected |
|---|---|---|
| `MILK-1L` | Batch expires in ~2 days | Amber badge; first under "Best before" sort and on Use soon |
| `YOGURT-500` | Two batches (≈9 and ≈12 days) | Product page lists both dates; a large quantity shows the split |
| `CHEESE-200` | Only an expired batch | "Temporarily unavailable"; excluded by `inStock=1`; cart validation flags it |
| `BUTTER-200`, `JUICE-1L` | Months away | No card badge; product page shows "Best before …" |
| `RICE-5KG` | Non-perishable | No expiry UI |

**Live changes:**
- In the admin, set *Settings → Stock → Hide from storefront within (days)* to 15. Milk and yogurt drop out or shrink after the cache window.
- Write off a batch in the admin, then re-open the cart. The line clamps or is flagged.
- Run the storefront with `TZ=America/Los_Angeles`. Dates still match the admin.
