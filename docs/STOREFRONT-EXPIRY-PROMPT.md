# Storefront brief: product expiry ("best before")

> **How to use this file:** paste it as the prompt for the coding agent working on the **Star Mart customer storefront** (a Next.js App Router app). It is self-contained: it describes the data source, the exact API contract, the business rules and the UI to build. You do not need access to the admin repository.

---

## 1. Context

Star Mart runs two apps:

| App | Role |
|---|---|
| **Star Mart Admin** (back office + POS, separate repo) | Owns the catalogue, stock and expiry data. Tracks stock in **batches (lots)**, each with its own expiry date, and sells the earliest-expiring batch first (FEFO). |
| **Storefront** (this app) | Customer-facing shop. Must show expiry information and must never offer expired stock. |

The admin now exposes a **read-only public JSON API** under `/api/public/*`. The storefront must use it as the source of truth for:

- prices
- **sellable** stock (expired units are already excluded)
- the expiry date of the units a customer would receive

**Goal of this task:**
- Add comprehensive expiry support to the storefront: badges, product detail info, filters and sorting.
- Enforce quantity limits in the cart and re-validate at checkout.
- Handle every edge case, using the API described below.

---

## 2. Configuration

Add these environment variables to the storefront (server-side only, never `NEXT_PUBLIC_`):

```bash
STAR_MART_API_URL=https://admin.star-mart.example   # origin of the admin app, no trailing slash
STAR_MART_API_KEY=<same value as STOREFRONT_API_KEY in the admin>
```

Rules:
- **Call the API only from server code**: Server Components, Route Handlers, Server Actions. The key must never reach the browser.
- If the browser needs fresh data (for example the cart drawer), add a storefront Route Handler that proxies to the admin with the key attached.
- In development the admin API works without a key when `STOREFRONT_API_KEY` is unset. In production a missing key returns `503`, and a wrong key returns `401`.
- Responses carry `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. Use `fetch(url, { headers, next: { revalidate: 60, tags: ["catalog"] } })` for listings and product pages.
- For **cart validation and checkout** use `cache: "no-store"`, because stock must be live.

---

## 3. API contract

Base: `${STAR_MART_API_URL}/api/public`. Every request sends the header `x-api-key: ${STAR_MART_API_KEY}`.

### 3.1 `GET /products`

| Query param | Type | Default | Notes |
|---|---|---|---|
| `q` | string ≤ 100 | — | Matches name, brand, SKU, or exact barcode |
| `category` | uuid | — | From `/categories` |
| `inStock` | `1` | off | Only products with `stock.sellableQty > 0` |
| `expiringSoon` | `1` | off | Only in-stock products whose `expiry.status` is `expiring_soon` (for a "Use soon / Deals" page) |
| `sort` | `name` \| `price_asc` \| `price_desc` \| `newest` \| `expiry` | `name` | `expiry` = soonest best-before first; products without expiry last |
| `page` | int ≥ 1 | 1 | |
| `pageSize` | 1–100 | 24 | |

Response `200`:

```json
{
  "data": [
    {
      "id": "8e0c7a95-c354-4c8f-80db-346c30b4ec71",
      "sku": "MILK-1L",
      "barcode": "2000000000077",
      "name": "Full Cream Milk 1 L",
      "description": null,
      "brand": null,
      "unit": "pcs",
      "allowFractional": false,
      "category": { "id": "03145e77-7e61-4288-a518-9e240db9191f", "name": "Dairy" },
      "imageUrl": null,
      "price": { "amountPaisa": 26500, "amount": "265.00", "currency": "PKR", "taxRateBps": 0, "taxInclusive": true },
      "stock": { "sellableQty": 75, "inStock": true, "lowStock": false, "unavailableReason": null },
      "expiry": {
        "tracksExpiry": true,
        "nearestExpiry": "2026-10-30",
        "daysToExpiry": 2,
        "status": "expiring_soon",
        "label": "Best before 30 Oct 2026 (2 days)",
        "shelfLifeDays": 7
      },
      "updatedAt": "2026-10-28T03:14:56.940Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 24, "total": 3, "pageCount": 1 },
  "meta": { "today": "2026-10-28", "timezone": "Asia/Karachi", "currency": "PKR", "expiryWarningDays": 30, "hideWithinDays": 0 }
}
```

### 3.2 `GET /products/{idOrSku}`

This takes a product UUID or a SKU (case-insensitive). It returns the same product object, plus `batches`: the sellable lots grouped by expiry, earliest first.

```json
{
  "data": {
    "id": "c3b5ab97-aa21-494a-afa6-615ff8f8b54a",
    "sku": "YOGURT-500",
    "name": "Yogurt 500 g",
    "unit": "pcs",
    "allowFractional": false,
    "price": { "amountPaisa": 18000, "amount": "180.00", "currency": "PKR", "taxRateBps": 0, "taxInclusive": true },
    "stock": { "sellableQty": 45, "inStock": true, "lowStock": false, "unavailableReason": null },
    "expiry": { "tracksExpiry": true, "nearestExpiry": "2026-11-06", "daysToExpiry": 9, "status": "expiring_soon", "label": "Best before 6 Nov 2026 (9 days)", "shelfLifeDays": 14 },
    "batches": [
      { "expiry": "2026-11-06", "qty": 21, "status": "expiring_soon" },
      { "expiry": "2026-11-09", "qty": 24, "status": "expiring_soon" }
    ],
    "…": "other fields as in the list"
  },
  "meta": { "today": "2026-10-28", "timezone": "Asia/Karachi" }
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

The endpoint returns `404 { "error": "not_found" }` when no active product has that id or SKU. Draft and archived products are never returned.

### 3.3 `GET /categories`

```json
{ "data": [ { "id": "a2620211-…", "name": "Beverages", "productCount": 4 }, { "id": "03145e77-…", "name": "Dairy", "productCount": 5 } ] }
```

### 3.4 Errors

Every error is JSON with this shape: `{ "error": string, "message"?: string }`.

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_query` | Bad query parameter |
| 401 | `unauthorized` | Missing or wrong `x-api-key` |
| 404 | `not_found` | Unknown product |
| 503 | `storefront_api_disabled` | The admin has no key configured (production) |

### 3.5 TypeScript types (copy into `lib/star-mart/types.ts`)

```ts
export type ExpiryStatus = "expired" | "expiring_soon" | "fresh" | "none";

export type StorefrontProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string;                // pcs, kg, g, l, ml, pack, box, dozen
  allowFractional: boolean;    // true → qty may have up to 3 decimals (e.g. 0.5 kg)
  category: { id: string; name: string } | null;
  imageUrl: string | null;
  price: { amountPaisa: number; amount: string; currency: string; taxRateBps: number; taxInclusive: true };
  stock: { sellableQty: number; inStock: boolean; lowStock: boolean; unavailableReason: "out_of_stock" | "expired" | null };
  expiry: {
    tracksExpiry: boolean;
    nearestExpiry: string | null;   // YYYY-MM-DD, store-local calendar date of the units the customer gets
    daysToExpiry: number | null;    // 0 = expires today
    status: ExpiryStatus;           // relative to the product's warning window; "none" when no date or not in stock
    label: string | null;           // ready-made text, e.g. "Best before 6 Nov 2026 (9 days)"
    shelfLifeDays: number | null;
  };
  updatedAt: string;                // ISO timestamp
};

export type StorefrontBatch = { expiry: string | null; qty: number; status: ExpiryStatus };
export type ProductDetail = StorefrontProduct & { batches: StorefrontBatch[] };

export type Paginated<T> = {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  meta: { today: string; timezone: string; currency: string; expiryWarningDays: number; hideWithinDays: number };
};
export type Category = { id: string; name: string; productCount: number };
```

---

## 4. Business rules the storefront must respect

1. **The admin decides what is sellable.**
   - `stock.sellableQty` already excludes expired units and units inside the admin's "hide from storefront" window (`meta.hideWithinDays`).
   - Never compute sellability yourself from dates, and never show stock beyond `sellableQty`.
2. **Dates are calendar days in the store timezone** (`meta.timezone`, normally `Asia/Karachi`), formatted `YYYY-MM-DD`. A product is sellable *through* its expiry date and expired from the next day.
   - Do **not** parse them with `new Date("2026-11-06")` for display: that is UTC midnight and shifts the day in some timezones.
   - Display `expiry.label`, or format with `Intl.DateTimeFormat(..., { timeZone: "UTC" })` on `new Date(value + "T00:00:00Z")`.
   - For "days left", trust `daysToExpiry` from the API, which is computed with the store's "today" (`meta.today`).
3. **FEFO:** the customer receives the earliest sellable batch first. `expiry.nearestExpiry` is therefore the date to promise. When the cart quantity exceeds the first batch, part of the order comes from later batches. The PDP may show that using `batches`.
4. **Status meanings for the UI:**
   - `expiring_soon`: inside the warning window (default 30 days, per-product override possible). Show a warm "Best before …" badge.
   - `fresh`: no badge needed in listings. On the PDP show "Best before …" when `tracksExpiry`.
   - `none`: no date (non-perishable, or not in stock). Show nothing about expiry.
   - `expired` never appears on a sellable product. Units the admin still holds are hidden and reported as `unavailableReason: "expired"`.
5. **Unavailable products:**
   - `unavailableReason: "out_of_stock"` → "Out of stock".
   - `"expired"` → "Temporarily unavailable" (do not tell customers the stock is expired).
   - In both cases disable add-to-cart and offer "Notify me" if the app has it.
6. **Prices are tax-inclusive** integers in paisa (1 PKR = 100 paisa). Use `amountPaisa` for maths, and `amount` or your currency formatter for display.
7. **Quantities:** if `allowFractional` is false, quantities are whole numbers. Otherwise allow steps of 0.001 (UI may use 0.25 / 0.5 kg presets). Always clamp to `0 < qty ≤ stock.sellableQty`.

---

## 5. What to build

### 5.1 Data layer — `lib/star-mart/client.ts`

- `starMartFetch<T>(path, { revalidate?: number | false, noStore?: boolean })`:
  - adds the key header and the base URL
  - throws a typed `StarMartError(status, code, message)` on non-2xx
  - uses a 5 s timeout via `AbortSignal.timeout(5000)`
- `getProducts(params)`, `getProduct(idOrSku)` (returns `null` on 404), `getCategories()`.
- Validate responses with zod (or at least narrow types). Unknown extra fields must not break parsing, because the API may add fields.
- Tag catalogue fetches with `"catalog"`, so an admin webhook or a `revalidateTag("catalog")` route can refresh them later.

### 5.2 Shared UI components

| Component | Behaviour |
|---|---|
| `<ExpiryBadge expiry stock />` | `expiring_soon` → amber pill: "Best before 6 Nov" (short date) with `title`/tooltip = full `label`; `daysToExpiry` 0 → "Best before today", 1 → "…tomorrow". `fresh` → render nothing in compact mode, "Best before 12 Mar 2027" in full mode. `none` / not in stock → nothing. |
| `<StockStatus stock />` | "In stock", "Only N left" when `lowStock`, "Out of stock", or "Temporarily unavailable" (`unavailableReason === "expired"`). |
| `<QuantityInput product />` | Enforces the step (whole number vs fractional) and the max `sellableQty`. Shows "Max N available" when the limit is reached. |

Accessibility:
- Badges must not rely on colour alone; they always include text.
- Use `aria-live="polite"` for quantity-limit messages.
- Dates in badges use `<time dateTime="2026-11-06">`.

### 5.3 Product listing / category / search pages

- Show `<ExpiryBadge compact>` on cards for `expiring_soon` items, and `<StockStatus>` for unavailable or low-stock ones.
- Add a **"Best before"** sort option (`sort=expiry`) and a filter chip **"Use soon"** (`expiringSoon=1`). Keep both in the URL search params so pages stay shareable and cacheable.
- Add an **"In stock only"** toggle (`inStock=1`), on by default for search.
- Optional page `/deals/use-soon` listing `expiringSoon=1&sort=expiry`.
- Unavailable products stay visible (greyed, add-to-cart disabled) unless "In stock only" is on.

### 5.4 Product detail page (`/products/[sku]`)

- Fetch with `getProduct(sku)`, and use `notFound()` on `null`.
- Under the price, show:
  - `<StockStatus>`
  - for `tracksExpiry` products with stock, a line **"Best before {label date}"** plus a short helper: "Date shown is for the item you will receive. Larger quantities may include later dates."
  - when `batches.length > 1`, an expandable "Available dates" list, e.g. "21 × best before 6 Nov · 24 × best before 9 Nov".
- If the chosen quantity is larger than `batches[0].qty`, update the helper: "N units best before 6 Nov, M units best before 9 Nov" (FEFO split preview).
- When `shelfLifeDays` is set and there is no stock, you may show "Typical shelf life: N days".
- Add `schema.org` Product JSON-LD with `offers.availability` (`InStock` / `OutOfStock`). Do not invent an expiry property.

### 5.5 Cart

- Store `sku`, `qty` and a snapshot of `price.amountPaisa`, `expiry.nearestExpiry` and `stock.sellableQty` at add time.
- On cart page load, and when the cart drawer opens, **re-validate**: fetch each line with `cache: "no-store"` through a server action or route handler. Then:
  - Product gone (404) or not `inStock` → mark the line "No longer available", exclude it from totals, and offer "Remove".
  - `qty > sellableQty` → clamp to `sellableQty` and show "Only N available, quantity updated".
  - Price changed → update and show "Price updated".
  - `nearestExpiry` changed to an earlier date, or the status became `expiring_soon` → show the new badge so the customer is not surprised.
- Show `<ExpiryBadge>` on each cart line for `expiring_soon` products.

### 5.6 Checkout

- Immediately before placing the order, run the same re-validation **server-side**. Block submission with a clear summary if anything changed, and let the customer review.
- Show a final notice when any line is `expiring_soon`: "Some items have a short best-before date: {list}." It needs no checkbox, just information.
- Keep the storefront's existing order submission. This brief does **not** add an order API to the admin. If the storefront has no order flow yet, stop at the re-validated cart and a "Continue" placeholder.

### 5.7 Resilience

- API down or `5xx` on listing or product pages: serve the cached version (`stale-while-revalidate`). If there is no cache, render a friendly error state with a retry button. Do not crash the page.
- During checkout re-validation, a failure must **block** checkout with "We could not confirm stock right now, please try again". Never place an order on stale data.
- Log `StarMartError`s server-side with status and path. Never log the API key.

---

## 6. Acceptance criteria

1. Expired stock is never orderable: a product whose only stock is expired shows "Temporarily unavailable" and add-to-cart is disabled.
2. Products within the warning window show a "Best before …" badge on cards, the PDP, the cart and checkout. The date matches `expiry.nearestExpiry` exactly, with no off-by-one in any browser timezone.
3. The PDP shows the best-before line for perishable products, and the per-date breakdown when there are several batches.
4. "Best before" sort and the "Use soon" filter work and are reflected in the URL.
5. Cart quantities can never exceed `sellableQty`. Re-validation clamps or flags lines, and checkout re-validates server-side with `no-store`.
6. Fractional products accept decimal quantities; others accept whole numbers only.
7. The API key is never sent to the browser. Check the Network tab and the built JS bundles for the key string.
8. Pages degrade gracefully when the admin API is unavailable.
9. Lighthouse accessibility ≥ 95 on listing and PDP. Badges have text and `<time>` elements.

---

## 7. Test plan

Use the admin's demo data (`npm run seed:demo` in the admin repo creates these cases):

| Product (SKU) | Situation | Expected storefront result |
|---|---|---|
| `MILK-1L` | Batch expires in ~2 days | Amber "Best before …" badge on the card; appears first under the "Best before" sort and "Use soon" |
| `YOGURT-500` | Two batches (≈9 and ≈12 days) | PDP lists both dates; choosing more than the first batch's qty shows the split |
| `CHEESE-200` | Only an expired batch | "Temporarily unavailable"; add-to-cart disabled; excluded with `inStock=1` |
| `BUTTER-200`, `JUICE-1L` | Expiry months away | No badge on the card; PDP shows "Best before …" |
| `RICE-5KG` | Non-perishable | No expiry UI anywhere |

Also test these:
- Set *Hide from storefront within (days)* to 15 in the admin (Settings → Stock). Milk and yogurt then become unavailable or reduced after the cache window.
- Write off a batch in the admin, then re-open the cart. The quantity clamps.
- Use a wrong `STAR_MART_API_KEY`. The storefront shows the error state, and checkout is blocked.
- Change the machine timezone to `America/Los_Angeles`. Dates still match the admin.

Unit-test `ExpiryBadge` (each status, 0/1/N days), `QuantityInput` (step and max) and the cart re-validation reducer (gone, clamp, price change, earlier expiry).
