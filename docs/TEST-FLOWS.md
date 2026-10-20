# Star Mart Admin — Complete Test Flows by Role

This document describes every module, screen, form rule, status machine and role permission in the Star Mart Admin app, and then gives step-by-step end-to-end flows for each type of user. It is written so that:

- **Claude Design** can draw user-journey flows per persona (super admin, admin, cashier, supplier) without access to the code.
- **Any tester** can exercise every feature completely and know what the expected result is at each step.

Conventions used below:

- `[/route]` is a page URL on the running app (base URL `http://localhost:3000`).
- **Expect:** lines state the observable outcome a tester should verify.
- Role groups: **managers** = super admin + admin; **staff** = managers + cashier; **vendor** = supplier portal user.
- Money is Pakistani Rupees (PKR) with 2 decimals. Quantities allow up to 3 decimals for products marked "fractional".
- Any page opened by a role that is not allowed shows a **404 Not found** page (never a 403). API endpoints vary (401 / 403 / 404), see the API table.

---

## 1. Environment and test data

### 1.1 Run locally

```bash
npm install
cp .env.example .env     # set DATABASE_URL (Neon Postgres) and AUTH_SECRET (32+ chars)
npm run db:migrate       # creates the star_mart schema and all tables
SEED_ADMIN_EMAIL=owner@example.com SEED_ADMIN_NAME="Owner" SEED_ADMIN_PASSWORD='ChooseAStrongPass123!' npm run seed:admin
npm run seed:demo        # demo catalogue, suppliers, customers, sales, expenses (never runs in production)
npm run dev              # http://localhost:3000
```

Optional flags for `seed:admin`: `--must-change-password` (forces a password change at first login, useful for testing that flow), `--reset-password` (rotate an existing account's password and sign it out everywhere), `--activate` (re-enable a disabled account), `--role cashier|admin|super_admin`.

### 1.2 Test accounts

| Persona | Role | How to get it | Password |
|---|---|---|---|
| Owner | `super_admin` | Created by `seed:admin` (values you choose) | The one you set |
| Store manager | `admin` | Create on `[/users]` as super admin, role "Admin" | Temporary 20-char password shown once; must be changed at first login |
| Till operator | `cashier` | Create on `[/users]` as super admin, role "Cashier" | Same as above |
| Supplier 1 | `vendor` | Created by `seed:demo`: `vendor1@star-mart.demo` (Karachi Wholesale Foods) | `Vendor-Demo-2026!` (no forced change) |
| Supplier 2 | `vendor` | `vendor2@star-mart.demo` (Punjab Dairy Co.) | `Vendor-Demo-2026!` |
| Supplier 3 | `vendor` | `vendor3@star-mart.demo` (Metro Beverages) | `Vendor-Demo-2026!` |

There are **no built-in admin or cashier credentials**. Create them as part of the super admin flow (section 6.1) and record the temporary passwords.

Password policy (all roles): 12–128 characters, no leading/trailing spaces, must not contain your email, must differ from the current password. Optionally rejected if found in Have I Been Pwned (when enabled).

### 1.3 What the demo seed creates

| Data | Details |
|---|---|
| Categories | Grocery, Dairy, Beverages, Household, Snacks |
| Suppliers | Karachi Wholesale Foods, Punjab Dairy Co., Metro Beverages (terms "Net 15"), each with the vendor login above |
| Products | 20 products with generated EAN-13 barcodes and opening stock. Three are **below reorder level**: `CHEESE-200`, `TEA-950`, `TISSUE-200` |
| Customers | 8 customers (retail and wholesale) with points balances and credit limits |
| Expenses | 7 expense categories and 15 expenses over the last 60 days (reference `DEMO`) |
| Purchases | 2 received purchases, invoice refs `DEMO-1`, `DEMO-2` |
| Sales | ~30 days of completed POS sales (note "demo seed") so dashboards and reports have data |

Re-running `seed:demo` is safe.

### 1.4 Reset

```bash
DB_RESET_CONFIRM=<database name> npm run db:reset -- --yes
npm run db:migrate && npm run seed:admin ... && npm run seed:demo
```

The reset only drops the `star_mart` and `drizzle` schemas. It never touches other schemas in the same database.

### 1.5 Optional integrations and how to test without them

| Integration | Env var | Behaviour when missing |
|---|---|---|
| Product images (Vercel Blob) | `BLOB_READ_WRITE_TOKEN` | Image field shows "not configured"; upload endpoint returns 503 |
| Email (Brevo) | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Queued emails fail with a clear reason. Set `BREVO_DRY_RUN=true` to render and log emails instead of sending |
| Email cron | `CRON_SECRET` (16+ chars) | `/api/jobs/email` returns 401 without the right secret |
| Pwned-password check | `PASSWORD_HIBP_CHECK=true` | Off by default |

---

## 2. Personas and access

### 2.1 Roles

| Role | Label in UI | Description shown when creating a user |
|---|---|---|
| `super_admin` | Super admin | Full access, including users, settings and the audit log |
| `admin` | Admin | All store operations except user management |
| `cashier` | Cashier | Point of sale, orders and customers only |
| `vendor` | Supplier | Supplier portal: own products, submissions and statement. Must be linked to a supplier record |

Customers do **not** have logins.

### 2.2 Sidebar menu by role

| Group | Menu item | Route | Super admin | Admin | Cashier | Supplier |
|---|---|---|---|---|---|---|
| — | Dashboard | `/dashboard` | ✓ | ✓ | ✓ | — |
| Sell | Point of sale | `/pos` | ✓ | ✓ | ✓ | — |
| Sell | Orders | `/orders` | ✓ | ✓ | ✓ | — |
| Sell | Customers | `/customers` | ✓ | ✓ | ✓ | — |
| Sell | Discount codes | `/discounts` | ✓ | ✓ | — | — |
| Catalogue | Products | `/products` | ✓ | ✓ | ✓ | — |
| Catalogue | Categories | `/products/categories` | ✓ | ✓ | — | — |
| Catalogue | Barcodes | `/products/barcodes` | ✓ | ✓ | ✓ | — |
| Catalogue | Stock | `/stock` | ✓ | ✓ | — | — |
| Supply | Suppliers | `/suppliers` | ✓ | ✓ | — | — |
| Supply | Purchases | `/purchases` | ✓ | ✓ | — | — |
| Supply | Approvals (with pending-count badge) | `/approvals` | ✓ | ✓ | — | — |
| Finance | Reports | `/reports` | ✓ | ✓ | — | — |
| Finance | Expenses | `/expenses` | ✓ | ✓ | — | — |
| System | Settings | `/settings` | ✓ | ✓ | — | — |
| System | Users | `/users` | ✓ | — | — | — |
| System | Audit log | `/audit` | ✓ | — | — | — |
| Supplier portal | Dashboard / Overview | `/vendor` | — | — | — | ✓ |
| Supplier portal | My products | `/vendor/products` | — | — | — | ✓ |
| Supplier portal | Submissions | `/vendor/submissions` | — | — | — | ✓ |
| Supplier portal | Statement | `/vendor/statement` | — | — | — | ✓ |
| Supplier portal | Profile | `/vendor/profile` | — | — | — | ✓ |
| Supplier portal | Security | `/vendor/security` | — | — | — | ✓ |

The user menu (top-right avatar) always has **Security** (`/settings/security`, or `/vendor/security` for suppliers) and **Sign out**.

### 2.3 Page access matrix (direct URL access)

| Route | Allowed | Notes |
|---|---|---|
| `/login` | public | Logged-in users are redirected to their home |
| `/` | any | Redirects to `/dashboard` |
| `/dashboard` | staff | Finance KPIs, balances and "New purchase" button only for managers |
| `/pos` | staff | Price override and line discounts only for managers |
| `/orders`, `/orders/new` | staff | Price override only for managers |
| `/orders/[id]` | staff | Cashier may cancel only **pending** orders |
| `/customers`, `/customers/[id]` | staff | Credit limit, activate/deactivate and points adjustment only for managers |
| `/products` | staff | Categories / Import / Export / New / Edit / Delete only for managers |
| `/products/barcodes` | staff | "Assign" button only for managers |
| `/products/new`, `/products/[id]/edit`, `/products/import`, `/products/categories` | managers | |
| `/discounts` | managers | |
| `/stock`, `/stock/adjust`, `/stock/take`, `/stock/movements` | managers | |
| `/suppliers`, `/suppliers/new`, `/suppliers/[id]`, `/suppliers/[id]/edit` | managers | |
| `/purchases`, `/purchases/new`, `/purchases/[id]` | managers | |
| `/approvals`, `/approvals/[id]` | managers | |
| `/reports` and `/reports/*` | managers | `/reports` redirects to `/reports/sales` |
| `/expenses`, `/expenses/new`, `/expenses/[id]/edit` | managers | |
| `/settings` | managers | "Email outbox" link shown only to super admin |
| `/settings/email` | managers | Admin can open it by URL even though the link is hidden |
| `/settings/security` | any logged-in user | Also reachable during a forced password change |
| `/users` | super admin only | |
| `/audit` | super admin only | |
| `/vendor` and all `/vendor/*` | vendor only (linked supplier must be active) | |
| `/print/invoices/[id]`, `/print/pos/receipt/[orderId]` | staff | |
| `/print/labels` | managers | |

### 2.4 Automatic redirects

| Situation | Result |
|---|---|
| Not logged in, opens any page | → `/login?callbackUrl=<page>`; after login the user lands on that page if allowed |
| Logged in, opens `/login` | → `/dashboard` (or `/vendor` for suppliers) |
| Supplier opens any non-portal page (e.g. `/dashboard`, `/products`) | → `/vendor` |
| Staff opens `/vendor` or `/vendor/*` | → `/dashboard` |
| Account flagged "must change password" opens any page | → `/settings/security?reason=must_change` (supplier: `/vendor/security?reason=must_change`) |
| Session revoked/expired/idle, user disabled, or password changed elsewhere | → `/login?reason=expired` |
| Sign out | → `/login?reason=logged_out` |
| After a password change | → `/login?reason=password_changed` |
| `callbackUrl` pointing to `/login`, `/api/*`, or an external site | Ignored; user lands on `/dashboard` |

### 2.5 Known inconsistencies to verify (do not assume intended)

1. **Cashier on Products / Barcodes**: the row action "Print label" and "View" links are visible to cashiers but lead to manager-only pages (`/print/labels`, `/products/[id]/edit`) → the cashier gets a 404.
2. **Cashier and discounts**: the README says cashiers have read access to discounts, but `/discounts` is manager-only (404 for cashiers). Cashiers can still **apply** a discount code in POS and the order editor.
3. **Email outbox link**: only super admin sees the "Email outbox" link on `/settings`, but an admin can open `/settings/email` directly.
4. **Barcodes "Print labels for this page"** button is shown to every role but the print page needs a manager.

---

## 3. Global rules every tester should know

| Rule | Value |
|---|---|
| Currency | PKR, stored in paisa, shown with 2 decimals. Prices are tax-inclusive; tax portion is derived per line |
| Quantities | Up to 3 decimals, only for products with "Allow fractional" on. Whole-unit products reject fractions |
| Stock | Changes only via stock movements. Never goes negative unless Settings → Stock → "Allow sales below zero stock" is on |
| Audit | Every create/update/delete/transition/login event is written to the audit log with actor, target, IP and details |
| Session | 30 minutes idle timeout; 12 hours absolute limit; sessions can be revoked individually |
| Login lockout | 5 failed attempts → locked 15 min, doubling per further failure, max 24 h. Super admin can unlock |
| Rate limits | 30 login submissions per IP and 10 per email per 15 min |
| Errors on login | Always the same generic message for wrong password and unknown email |
| Wrong role | Pages show 404 |
| Concurrency | Stale actions (e.g. confirming an already confirmed order, approving an already reviewed submission) fail with a clear error, nothing is partially written |
| Document numbers | `ORD-000001` orders, `INV-000001` invoices, `PO-000001` purchases, `SUP-000001` supplier submissions. Prefixes editable in Settings |

---

## 4. Module reference

### 4.1 Authentication and session

**Login `[/login]`** — fields: Email, Password. Query `?reason=expired|password_changed|logged_out` shows a notice.

- Wrong password / unknown email → same generic error.
- 5 failures → account locked (generic error still shown, audit event `login.locked`).
- Success → `/dashboard` (staff) or `/vendor` (supplier), or the `callbackUrl` when allowed.
- Account with "must change password" → forced to the security page; every other page redirects there until the password is changed.

**Security page `[/settings/security]` / `[/vendor/security]`**

- Change password: Current password, New password, Confirm. Rules: 12–128 chars, no leading/trailing spaces, not containing the email, different from current. On success all sessions are revoked and the user is sent to `/login?reason=password_changed`.
- Active sessions list (device/user agent, IP, last seen, current badge). Actions: **Revoke** a single session, **Sign out other devices**.

**Sign out** — user menu → Sign out → `/login?reason=logged_out`.

**Session expiry** — a revoked/expired session hitting any page is cleared and redirected to `/login?reason=expired`.

### 4.2 Dashboard `[/dashboard]` (staff)

- KPI tiles: Sales today, Open orders, Low stock, Stock at cost (managers), Customers owe (managers), Owed to suppliers (managers), Pending approvals (managers) or Customers (cashier).
- Chart: last 14 days of sales.
- Lists: recent orders, low-stock products.
- "New purchase" button (managers).

**Expect:** Sales today equals the Sales report filtered to "today".

### 4.3 Products

**List `[/products]`** (staff; 25 per page)

- Search by name, SKU (partial) or barcode (exact).
- Filters: Category, Supplier, Status (Active default / Draft / Archived / All), Low stock only.
- Sort: name, SKU, price, stock, updated (asc/desc).
- Scanning a barcode (USB scanner or camera) on the list jumps to `?q=<code>&status=all`.
- Row actions: Edit (managers) / View, Print label, Stock ledger, Archive / Restore, Delete (confirm dialog).
- Header actions (managers): Categories, Import, Export CSV, New product.

**Product form `[/products/new]`, `[/products/[id]/edit]`** (managers)

| Field | Rule |
|---|---|
| Name | required, max 200 |
| SKU | required, max 64, letters/digits/`.`/`_`/`-`, saved upper-case, unique |
| Barcode | optional, max 64, letters/digits/`-`, unique. **Generate** button creates an EAN-13 from the settings prefix (default 200) + counter |
| Category | select |
| Brand | max 100 |
| Description | max 2000 |
| Unit | pcs, kg, g, l, ml, pack, box, dozen |
| Allow fractional | switch |
| Cost, Price | money ≥ 0, max 2 decimals |
| Tax rate | 0–100 % |
| Reorder level, Reorder qty | 0–999999.999 |
| Supplier | select |
| Image | upload (jpeg/png/webp, max 2 MB); replacing deletes the old file |
| Status | active, draft, archived |
| Opening stock | create only; writes an "initial" stock movement |

Duplicate SKU or barcode → inline error.

**Archive / Restore** toggles archived ↔ active.
**Delete** removes the product only if nothing references it. If it appears on any purchase, order, or has non-initial stock movements, it is archived instead and the page shows "archived instead" notice.

**Categories `[/products/categories]`** (managers) — create, rename, activate/deactivate. Names unique (case-insensitive), max 80.

**CSV import `[/products/import]`** (managers)

1. Upload file (max 4 MB, max 5000 rows; `sku` and `name` columns required). Columns: sku, name, barcode, category, brand, unit, allow_fractional, cost, price, tax_rate_percent, reorder_level, reorder_qty, supplier, status, stock_qty, description.
2. **Preview** marks each row as Create / Update / Error. A SKU repeated inside the file is an error.
3. **Commit** upserts by SKU, auto-creates missing categories, matches suppliers by name, applies `stock_qty` as opening stock only for new products.

**CSV export** — `/api/products/export?status=<status>` streams a CSV in the import format; `?template=1` returns a sample file.

**Barcodes `[/products/barcodes]`** (staff; 50 per page)

- Filters: search, category, Show: Assigned / Missing / All.
- Each row: barcode preview (EAN-13 if valid, otherwise Code 128; falls back to SKU), price.
- Actions: Download PNG (3×), Download SVG, Print label (row), Print labels for this page, Assign (managers; opens the product edit page).

**Label printing `[/print/labels?ids=<id,id>&copies=1..50&layout=a4-65|a4-24|thermal-50x30]`** (managers) — up to 200 ids.

### 4.4 Stock (managers)

**Overview `[/stock]`** (50 per page) — KPIs: stock value at cost, active products, low stock, out of stock. Filters: search, category, supplier, low stock only. Row actions: Adjust, Ledger.

**Movements `[/stock/movements]`** — filters: kind (purchase, purchase_return, sale, sale_return, adjustment, stock_take, initial), from/to dates, `?product=` shows a running balance. Rows link to the related purchase or order.

**Adjustment `[/stock/adjust?product=]`** — Product, Direction (In / Out), Qty > 0 (whole number for non-fractional products), Reason (damaged, expired, count_correction, theft, other), Note (max 500). Stock cannot go below zero.

**Stock take `[/stock/take]`** — choose scope (category or supplier, max 1000 products) → count sheet → enter counted quantities (blank rows skipped) → **Preview** differences → **Commit**. Writes only the differences as `stock_take` movements. Committing with no differences shows "Nothing to commit".

Adjustments and stock takes trigger the low-stock email check.

### 4.5 Suppliers (managers)

**List `[/suppliers]`** (25 per page) — search by name/contact/phone/email; filter Active / Inactive / All; columns include product count and balance.

**Form `[/suppliers/new]`, `[/suppliers/[id]/edit]`** — Name (required, max 120, unique), Contact name, Phone, Email (validated), Address, Tax ID, Payment terms, Notes.

**Detail `[/suppliers/[id]]`** — KPIs: Purchased, Paid, Returned, Balance (status Owed / Settled / Overpaid). Tabs: Overview, Products, Purchases, Payments, Returns, Statement. Actions: Edit, Activate/Deactivate, **Record payment**, **Record return**.

**Record payment** — Against: a received purchase or "On account"; Amount > 0 (cannot exceed what is outstanding on that purchase); Method: cash, bank_transfer, card, other; Reference; Date; Note. Updates the purchase payment status (unpaid → partial → paid).

**Record return** — Product, Qty > 0, Credit amount ≥ 0, Related purchase (optional), Reason. Writes a negative `purchase_return` stock movement; cannot take stock below zero.

### 4.6 Purchases (managers)

**Status machine:** `draft → received` or `draft → cancelled`. Payment status: `unpaid → partial → paid`.

**List `[/purchases]`** (25 per page) — search by number or supplier invoice ref; filters: status, payment status, supplier.

**New `[/purchases/new?supplier=]`**

- Supplier (required), Supplier invoice no. (max 80), Notes, **Goods received now** switch (on by default).
- Lines (1–200): product (search or scan), Qty > 0, Unit cost, Batch (max 60), Expiry date. Archived products rejected; whole-unit products reject fractions.

**Receiving** (on save with the switch on, or later via **Mark received**) books `purchase` stock movements and sets each product's cost to the latest purchase cost.

**Detail `[/purchases/[id]]`** — lines, totals, payments. Actions: Mark received (draft only), Cancel (draft only), Record payment (received only).

### 4.7 Approvals — supplier submissions (managers)

**Status machine:** `pending → approved` or `pending → rejected`. Reviewing an already-reviewed submission fails with an error.

**List `[/approvals]`** — filters: State (Pending default / Approved / Rejected / All), Kind (product / supply), Supplier. Sidebar badge shows the pending count.

**Review `[/approvals/[id]]`**

- **Product submission** → full product form pre-filled from the supplier's proposal (status forced to active) → **Approve** creates the product linked to the supplier. Duplicate SKU/barcode → error.
- **Supply submission** → **Approve** creates a *received* purchase (books stock, updates costs) and redirects to it.
- **Reject** requires a note; the supplier sees it on their Submissions page.

### 4.8 Supplier portal (vendor)

| Page | Contents / actions |
|---|---|
| `/vendor` Overview | Product count, pending submissions, balance owed to the supplier, low-stock list of their products with suggested reorder quantity |
| `/vendor/products` | Read-only list of the supplier's products with stock |
| `/vendor/submit/product` | Propose a product: Name (required), SKU, Barcode, Description, Unit, Fractional, Cost, Suggested price, Tax %, Category (free text), Image, Note |
| `/vendor/submit/supply` | Report a delivery: Invoice ref, Note, Lines (only the supplier's own non-archived products; search and barcode lookup scoped to them) |
| `/vendor/submissions` | Own submissions with number, kind, status and the store's review note |
| `/vendor/statement` | Ledger: delivered (purchases), paid, returned, running balance |
| `/vendor/profile` | Edit business name, contact person, phone, email, address, tax ID, payment terms |
| `/vendor/security` | Change password, sessions (same as staff security page) |

A supplier whose supplier record is deactivated gets 404 on every portal page.

### 4.9 Customers (staff)

**List `[/customers]`** (25 per page) — search by name/phone/email; filters: Type (retail / wholesale), Active / Inactive / All. Columns: points, credit used / limit, order count, last order. **New customer** dialog.

**Customer form (dialog)**

| Field | Rule |
|---|---|
| Name | required, max 120 |
| Phone | 7–15 digits, unique |
| Email | validated |
| Address | max 500 |
| Type | retail, wholesale |
| Notes | max 1000 |
| Credit limit | **managers only** (field absent/ignored for cashiers) |

**Detail `[/customers/[id]]`** — tabs: Orders, Points, Credit. Actions: Edit, New order (pre-fills `/orders/new?customer=`), Activate/Deactivate (managers), **Adjust points** (managers), **Record credit payment** (staff).

- Adjust points: non-zero integer (max ±1,000,000), note 3–200 chars required, balance cannot go negative.
- Record credit payment: Amount > 0 and ≤ amount owed, Method cash / card / bank_transfer, Reference. Button disabled when nothing is owed.

**Loyalty maths (defaults, editable in Settings → Loyalty):** 1 point per 100 PKR paid (after discounts, excluding redeemed value); 1 point = 1 PKR; minimum 100 points per redemption.

### 4.10 Discount codes (managers)

**List `[/discounts]`** — status column: Active / Inactive / Expired / Used up. Create / Edit dialog, Enable / Disable.

| Field | Rule |
|---|---|
| Code | 3–32 chars, `A–Z 0–9 _ -`, saved upper-case, unique |
| Kind | percent (0.01–100) or fixed (amount > 0) |
| Minimum order | money ≥ 0 |
| Maximum discount | optional cap |
| Starts at / Ends at | end must be after start |
| Usage limit | ≥ 1; cannot be set below the current used count |

**Checkout validation order:** not found → inactive → not started → expired → used up → below minimum order. A percent discount is rounded down and capped by the maximum. Applied after manual line discounts.

### 4.11 Orders (staff)

**Status machine**

| From | Allowed next |
|---|---|
| pending | confirmed, cancelled |
| confirmed | ready, out_for_delivery, completed, cancelled |
| ready | completed, out_for_delivery, cancelled |
| out_for_delivery | completed, cancelled |
| completed | cancelled |
| cancelled | — |

Only delivery orders may go out_for_delivery.

**Side effects**

- **Confirm**: deducts stock (fails if insufficient unless negative stock allowed), issues invoice `INV-…` due in N days (Settings → Invoices), emails the invoice if the customer has an email.
- **Complete**: requires full payment; deducts stock if not yet done; credits earned points; marks invoice paid.
- **Cancel**: reason ≥ 3 chars required; cashier only from *pending*. Returns stock (`sale_return`), refunds redeemed points, takes back earned points (fails if already spent), reverses credit used, decrements the discount code usage, records refunds as negative payments by the chosen method, voids the invoice, sets payment status to refunded or unpaid.

**List `[/orders]`** (25 per page) — search by number, customer or phone; filters: Status (incl. "Open"), Fulfilment, Payment, Channel, Customer, From/To. Shows total for the current filter.

**New order `[/orders/new?customer=]`**

- Channel: phone / walk_in. Fulfilment: pickup / delivery (delivery requires an address; fee from Settings, free above threshold).
- Customer: account, or name/phone without an account.
- Scheduled date/time, Notes, Discount code, Points to redeem.
- Lines 1–200 (search or scan). Managers can override unit price and give per-line discounts.
- Optional deposit: method + amount (≤ total; credit requires a customer account and respects the credit limit).

**Detail `[/orders/[id]]`** — items, totals, timeline of status events, payments. Actions: status transitions per the table, **Record payment** (cash shows received and change; card/bank cannot exceed due; credit needs an account and is capped by the limit; not allowed on cancelled orders), **Cancel** (reason + refund method), Invoice: **Print**, **PDF**, **Email**.

### 4.12 Point of sale `[/pos]` (staff)

Full-screen till. A POS sale is created already **completed**: stock deducted, payments taken, points credited, invoice issued and paid, receipt emailed if an email is present.

- **Add items**: scan (USB scanner), search (F2) + Enter, camera scan (F7). Scanning the same product again increments quantity.
- **Lines**: + / − quantity, remove; managers can override price and add a line discount.
- **Customer (F4)**: pick an account, or **Guest checkout** (name, phone 7–15 digits, email validated; all optional). Guests cannot redeem points or pay on credit. Account and guest are mutually exclusive.
- **Discount code (F8)**: validated as in 4.10.
- **Points**: redeem from the account's balance (min 100).
- **Pay (F9)** dialog: payment lines (method cash / card / bank_transfer / credit; up to 10 via **Split payment**), cash quick buttons 500 / 1,000 / 5,000 and **Exact**; card/bank cannot exceed the due amount; credit blocked when over the customer's limit; **Complete sale** (Ctrl+Enter) disabled while payment is short. Change shown for cash.
- **Receipt**: printed through a hidden iframe (`/print/pos/receipt/<id>`); **Reprint last receipt** available.
- **Hold / resume**: Ctrl+H holds the cart (kept per cashier in the browser), Ctrl+Shift+H lists held sales to resume.

| Hotkey | Action |
|---|---|
| F2 | Search products |
| F4 | Customer |
| F7 | Camera scan |
| F8 | Discount code |
| F9 | Pay |
| + / − | Change quantity of the highlighted line (outside inputs) |
| Delete | Remove the highlighted line |
| Ctrl+H | Hold sale |
| Ctrl+Shift+H | Held sales |
| Esc | Close dialog |
| Ctrl+Enter | Complete sale (in payment dialog) |

**Returns:** there is no separate return screen. A customer return is done by cancelling the order (managers can cancel completed orders; cashiers only pending ones). Supplier returns are recorded on the supplier page.

### 4.13 Expenses (managers)

**List `[/expenses]`** (50 per page) — search by description/reference; filters: category, method, from/to; **Export CSV**; categories card (create, rename, activate/deactivate; unique names).

**Form `[/expenses/new]`, `[/expenses/[id]/edit]`** — Category (required), Description (required, max 200), Amount > 0, Method (cash / card / bank_transfer), Reference (max 100), Date, Receipt URL (valid URL). **Delete** is a soft delete.

### 4.14 Reports (managers)

All reports take a date range: `range=today|7d|30d|month|custom&from=&to=` (default 30 days, max 366 days).

| Report | Route | Contents | CSV |
|---|---|---|---|
| Sales | `/reports/sales` | Revenue, average order, discounts + points, tax; by day; by channel; by payment method; top products with gross profit | ✓ |
| Purchases | `/reports/purchases` | Purchased, paid, outstanding, supplier count; by day; by supplier; most purchased products | ✓ |
| Profit & loss | `/reports/pnl` | Net revenue (ex. tax), gross profit, expenses, net profit; daily chart; expenses by category; statement | ✓ |
| Expenses | `/reports/expenses` | Total, per day, by category, by method, by day | ✓ |
| Stock | `/reports/stock` | Value at cost and at retail, low stock, out of stock, valuation by category, dead stock | ✓ |
| Loyalty | `/reports/loyalty` | Points issued, redeemed, manual/reversed, outstanding liability, top balances | — |
| Balances | `/reports/balances` | Customers owe, owed to suppliers, supplier overpayments, net position | — |

CSV exports live at `/api/reports/<sales|purchases|pnl|expenses|stock>?range=…`.

### 4.15 Settings (managers)

Each group on `[/settings]` saves separately.

| Group | Fields and limits |
|---|---|
| Store identity | Name (1–100), Address, Phone, Email, Tax/NTN number, Timezone (default Asia/Karachi) |
| Currency display | Code (3 letters), Symbol, Number locale |
| Loyalty points | Enabled, Spend per point (PKR ≥ 1), Value of one point (PKR), Minimum points to redeem |
| Stock | Default reorder level, Allow sales below zero stock, Send low-stock emails |
| Delivery | Delivery fee, Free delivery above (blank = never) |
| Invoices | Due in days (0–365), Terms text |
| POS receipt | Header, Footer (max 500 each) |
| Document numbering | Order, Invoice, Purchase, Supplier submission prefixes (1–8 chars) |
| Barcodes | EAN-13 prefix (2–4 digits, default 200) |
| Tax | Default tax rate % |

**Email `[/settings/email]`** — integration status, **Send test email**, outbox (last 50) with status pending / sending / sent / failed, **Retry** one or all failed, **Run outbox now**. Retries up to 5 times with backoff 1 min, 5 min, 30 min, 2 h, 4 h. Templates: order_confirmation, invoice, low_stock, supplier_low_stock, test_email. Low-stock emails go at most once per product per 24 h to the store email (or super admins) and to the supplier.

**Cron** — `GET|POST /api/jobs/email` with header `x-cron-secret: <CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>`: runs the low-stock scan and sends up to 25 queued emails.

### 4.16 Users `[/users]` (super admin)

**Create user** — Email, Name (max 100), Role (super_admin / admin / cashier / vendor), Supplier (required for vendor). Shows a one-time 20-character temporary password; the user must change it at first login.

**Row actions**

| Action | Rule |
|---|---|
| Change role | Not on yourself; signs that user out everywhere |
| Disable / Enable | Not on yourself; not the last active super admin; disabling signs them out |
| Reset password | Not on yourself; also unlocks and signs out; shows a new temporary password |
| Unlock | Clears a login lockout |
| Revoke sessions | Signs the user out everywhere |

### 4.17 Audit log `[/audit]` (super admin)

Last 200 events: action (e.g. `login.success`, `order.cancelled`, `products.exported`), actor, target, IP, user agent, details.

### 4.18 Print pages

| Route | Allowed | Content |
|---|---|---|
| `/print/invoices/[id]?print=1` | staff | A4 invoice |
| `/print/pos/receipt/[orderId]?print=1` | staff | 80 mm receipt |
| `/print/labels?ids=&copies=&layout=` | managers | Label sheet: A4 65 per sheet, A4 24 per sheet, or thermal 50×30 mm |

### 4.19 API endpoints

| Endpoint | Allowed | Wrong role / no session |
|---|---|---|
| `GET /api/products/export?status=&template=1` | managers | 403 / 401 |
| `GET /api/barcode/[productId]?format=svg\|png&scale=1-8&height=5-40&text=0&download=1` | any session; vendor only for own products | 404 |
| `POST /api/blob/upload` | managers or vendor | 401 (503 if Blob not configured) |
| `GET /api/pos/products?q=\|barcode=` | staff | 401 |
| `GET /api/pos/customers?q=` (2+ chars) | staff | 401 |
| `GET /api/invoices/[id]/pdf?inline=1` | any non-vendor | 404 |
| `GET /api/reports/[sales\|purchases\|pnl\|expenses\|stock]` | managers | 404 |
| `GET\|POST /api/jobs/email` | cron secret | 401 |
| `GET /api/session/expire` | public | clears cookie → `/login?reason=expired` |

---

## 5. Data model cheat-sheet (for labels and states)

| Entity | States / values |
|---|---|
| User role | super_admin, admin, cashier, vendor |
| Product status | active, draft, archived |
| Product unit | pcs, kg, g, l, ml, pack, box, dozen |
| Supplier submission | kind: product, supply · status: pending, approved, rejected |
| Purchase | status: draft, received, cancelled · payment: unpaid, partial, paid |
| Supplier payment method | cash, bank_transfer, card, other |
| Stock movement kind | purchase, purchase_return, sale, sale_return, adjustment, stock_take, initial |
| Stock adjustment reason | damaged, expired, count_correction, theft, other |
| Customer type | retail, wholesale |
| Loyalty transaction | earn, redeem, adjust, reverse |
| Discount kind | percent, fixed |
| Order channel | pos, phone, walk_in |
| Order fulfilment | pickup, delivery |
| Order status | pending, confirmed, ready, out_for_delivery, completed, cancelled |
| Order payment status | unpaid, partial, paid, refunded |
| Payment method | cash, card, bank_transfer, credit |
| Invoice status | issued, paid, void |
| Expense method | cash, card, bank_transfer |
| Email status | pending, sending, sent, failed |

---

## 6. End-to-end flows by role

Each flow is numbered so Claude Design can turn it into a journey diagram. Run them in order; later flows reuse data created earlier.

### 6.1 Super admin — full setup and administration

**Flow SA-1: First sign-in and forced password change**
1. Open `[/dashboard]` while logged out. **Expect:** redirect to `/login?callbackUrl=%2Fdashboard`.
2. Log in with the seeded super admin (seeded with `--must-change-password`). **Expect:** redirect to `/settings/security?reason=must_change`; sidebar links all bounce back here.
3. Enter a weak new password (e.g. 8 chars). **Expect:** policy error.
4. Enter a strong password. **Expect:** signed out to `/login?reason=password_changed`.
5. Log in again. **Expect:** `/dashboard` with KPIs.

**Flow SA-2: Configure the store**
1. `[/settings]` → Store identity: set Name, Address, Phone, Email, Tax ID → Save. **Expect:** success toast; values persist after reload.
2. Loyalty: Enabled on, Spend per point 100, Value 1, Minimum 100 → Save.
3. Delivery: fee 150, free above 5000 → Save.
4. Invoices: Due in 7 days, terms text → Save.
5. POS receipt: header/footer → Save. Numbering: leave prefixes. Barcodes: prefix 200. Tax: 17.
6. Try a numbering prefix of 9 characters. **Expect:** validation error (1–8).
7. `[/settings/email]` → Send test email (with `BREVO_DRY_RUN=true`). **Expect:** outbox row goes pending → sent.

**Flow SA-3: Create staff and supplier users**
1. `[/users]` → Create user: email `manager@test.local`, name "Store Manager", role Admin. **Expect:** dialog shows a 20-char temporary password once; row appears with "must change password".
2. Create `cashier@test.local`, role Cashier. Record the password.
3. Create `supplier4@test.local`, role Supplier, **without** choosing a supplier. **Expect:** error "supplier required".
4. Repeat with supplier "Karachi Wholesale Foods". **Expect:** created and linked.
5. On your own row try **Disable** and **Change role**. **Expect:** both blocked.
6. Disable every other super admin (if any) then try to disable the last one. **Expect:** "last active super admin" error.
7. **Reset password** on the cashier. **Expect:** new temporary password shown; cashier sessions revoked.
8. `[/audit]`. **Expect:** `user.created`, `user.password_reset` events with your email as actor.

**Flow SA-4: Catalogue**
1. `[/products/categories]` → add "Frozen". Add "frozen" again. **Expect:** duplicate error. Deactivate then reactivate it.
2. `[/products/new]` → fill Name "Test Cola 1.5L", SKU `test-cola-15` (**Expect:** saved as `TEST-COLA-15`), click **Generate** barcode (**Expect:** 13-digit code starting with 200), Category Beverages, Unit pcs, Cost 80, Price 120, Tax 17, Reorder level 10, Reorder qty 24, Supplier Metro Beverages, Opening stock 50, Status Active → Save.
3. Create another product with the same SKU. **Expect:** duplicate SKU error.
4. `[/products]` → search `TEST-COLA`. **Expect:** row with stock 50. Sort by price desc. Filter Low stock. **Expect:** CHEESE-200, TEA-950, TISSUE-200 present.
5. Row → Print label → `[/print/labels?ids=…&copies=3&layout=a4-65]`. **Expect:** 3 labels rendered.
6. `[/products/import]` → download template via Export → upload a CSV with 2 new SKUs and 1 existing SKU with a new price → Preview. **Expect:** 2 Create, 1 Update. Commit. **Expect:** products listed; new ones have opening stock.
7. Export CSV. **Expect:** download in import format.
8. `[/products/barcodes]` → Show: Missing. **Expect:** products without barcodes; **Assign** opens the edit page. Download PNG and SVG for one product. **Expect:** file downloads.
9. On "Test Cola 1.5L" → Delete. **Expect:** deleted (no references yet). Create it again for later flows.

**Flow SA-5: Suppliers and purchases**
1. `[/suppliers/new]` → Name "Lahore Snacks Ltd", contact, phone, email, terms "Net 30" → Save. **Expect:** detail page, balance 0, status Settled.
2. `[/purchases/new?supplier=<id>]` → invoice ref `LS-001`, add line "Test Cola 1.5L" qty 20 cost 75 (via search), add a second line by typing/scanning a barcode, "Goods received now" **on** → Save. **Expect:** purchase `PO-…` status Received, payment Unpaid; product stock 70; product cost now 75.
3. Create another purchase with the switch **off**. **Expect:** status Draft. Open it → **Cancel**. **Expect:** Cancelled, stock unchanged.
4. Supplier detail → **Record payment** against the received purchase, amount greater than outstanding. **Expect:** error. Pay exactly half. **Expect:** purchase payment Partial, supplier balance reduced.
5. **Record return**: Test Cola qty 2, credit 150. **Expect:** stock 68; returns tab shows it; balance reduced.
6. `[/reports/purchases]` range 7d. **Expect:** purchase appears by supplier.

**Flow SA-6: Supplier submissions and approvals** (run flow V-1 first, as a supplier)
1. `[/approvals]`. **Expect:** badge count ≥ 2; pending product and supply submissions listed.
2. Open the product submission → edit price → **Approve**. **Expect:** product created, active, linked to the supplier; submission Approved.
3. Open the supply submission → **Approve**. **Expect:** redirected to a new *received* purchase; stock increased.
4. Submit another product as the supplier, then **Reject** it with a note. **Expect:** status Rejected; supplier sees the note (flow V-2).
5. Try approving the already-approved one via browser back + resubmit. **Expect:** "already reviewed" error.

**Flow SA-7: Stock control**
1. `[/stock]` → KPIs; filter Low stock only. **Expect:** low-stock items.
2. Adjust → Test Cola, Out, qty 2, reason damaged, note → Save. **Expect:** stock −2; `[/stock/movements?product=…]` shows running balance.
3. Adjust Out with qty greater than stock. **Expect:** "cannot go below zero" error.
4. `[/stock/take]` → scope Category Beverages → start → enter counts (change one by +3, leave others blank) → Preview. **Expect:** one difference. Commit. **Expect:** one `stock_take` movement. Commit again with same counts. **Expect:** "Nothing to commit".

**Flow SA-8: Customers and discounts**
1. `[/customers]` → New customer: "Ayesha Khan", phone `03001234567`, type retail, credit limit 5,000 → Save. Create another with the same phone. **Expect:** duplicate phone error.
2. Customer detail → Adjust points +500 with note. **Expect:** balance 500. Adjust −600. **Expect:** refused. Adjust −200. **Expect:** 300.
3. Record credit payment. **Expect:** button disabled (nothing owed).
4. `[/discounts]` → New: code `welcome10`, percent 10, min order 500, max 200 → Save. **Expect:** saved as `WELCOME10`, Active. Create `EXPIRED5` with end date yesterday. **Expect:** status Expired. Create `WELCOME10` again. **Expect:** duplicate error. Disable then enable `WELCOME10`.

**Flow SA-9: Phone order lifecycle**
1. `[/orders/new]` → channel phone, fulfilment delivery, customer Ayesha Khan, delivery address, add Test Cola ×5, discount code `WELCOME10`, deposit cash 100 → Create. **Expect:** order `ORD-…` Pending, payment Partial, delivery fee 150 applied (or 0 if subtotal ≥ 5,000).
2. Apply `EXPIRED5` in another order. **Expect:** "expired" message.
3. Order detail → **Confirm**. **Expect:** status Confirmed, stock −5, invoice `INV-…` issued, email queued (if customer has email). Press Confirm again from a stale tab. **Expect:** transition error.
4. **Record payment** → method credit for the remaining balance. **Expect:** customer credit balance increases; payment Paid.
5. Mark **Out for delivery** → **Completed**. **Expect:** points earned (≈ paid ÷ 100), invoice Paid.
6. Try to complete an unpaid order. **Expect:** "requires full payment".
7. Try to confirm an order whose quantity exceeds stock. **Expect:** insufficient stock error (unless negative stock allowed).
8. **Cancel** the completed order with reason, refund cash. **Expect:** stock restored, points reversed, credit reversed, negative cash payment recorded, invoice Void, payment status Refunded.
9. Invoice → Print, PDF, Email. **Expect:** A4 page; PDF download; outbox row.

**Flow SA-10: POS as a manager**
1. `[/pos]` → scan/search Test Cola, override price to 100, add line discount 10 (manager-only controls visible). F4 → pick Ayesha. F8 → `WELCOME10`. F9 → cash 1,000 → Complete sale. **Expect:** change shown; receipt iframe prints; order Completed in `[/orders]` with channel pos.

**Flow SA-11: Expenses and reports**
1. `[/expenses]` → add category "Utilities". `[/expenses/new]` → Utilities, "Electricity bill", 12,000, bank_transfer, date today → Save. Edit amount to 12,500. Delete. **Expect:** removed from list (soft deleted).
2. `[/reports/sales]` range today. **Expect:** today's POS sale; matches dashboard "Sales today".
3. `[/reports/pnl]` 30d. **Expect:** net profit = gross profit − expenses. Export CSV.
4. Open `[/reports/stock]`, `[/reports/loyalty]`, `[/reports/balances]`, `[/reports/expenses]`. **Expect:** each renders; balances show the supplier amount owed and Ayesha's credit.
5. Custom range longer than 366 days. **Expect:** clamped or rejected.

**Flow SA-12: Security and sessions**
1. Log in from a second browser. `[/settings/security]` → **Sign out other devices**. **Expect:** second browser redirected to `/login?reason=expired` on next click.
2. `[/users]` → Revoke sessions on the cashier while the cashier is logged in. **Expect:** cashier gets expired.
3. Enter the wrong password 5 times for the cashier. **Expect:** generic error each time; `[/users]` shows Locked; **Unlock** clears it.
4. `[/audit]`. **Expect:** `login.failed`, `login.locked`, `session.revoked` events.

### 6.2 Admin — store operations without user management

**Flow A-1**
1. Log in as `manager@test.local` with the temporary password. **Expect:** forced change → re-login → `/dashboard`.
2. Sidebar. **Expect:** no Users, no Audit log; Settings present.
3. Open `[/users]` and `[/audit]` by URL. **Expect:** 404.
4. `[/settings]`. **Expect:** no "Email outbox" link; `[/settings/email]` by URL still opens (verify inconsistency 2.5 #3).
5. Repeat flows SA-4 through SA-11 (catalogue, suppliers, purchases, approvals, stock, customers, discounts, orders, POS, expenses, reports). **Expect:** identical behaviour to super admin.
6. Dashboard. **Expect:** manager KPIs (stock at cost, balances, pending approvals) visible.

### 6.3 Cashier — till, orders and customers only

**Flow C-1: First login and navigation**
1. Log in as `cashier@test.local`. **Expect:** forced password change → re-login → `/dashboard`.
2. Sidebar. **Expect:** Dashboard, Point of sale, Orders, Customers, Products, Barcodes only.
3. Dashboard. **Expect:** no finance KPIs (stock at cost, balances); no "New purchase" button; "Customers" tile instead of "Pending approvals".
4. Open by URL: `/discounts`, `/products/new`, `/products/categories`, `/stock`, `/suppliers`, `/purchases`, `/approvals`, `/reports/sales`, `/expenses`, `/settings`, `/users`, `/audit`, `/print/labels`. **Expect:** 404 for each.
5. `[/products]`. **Expect:** list readable; no New / Import / Export / Categories buttons; no Delete/Archive. Click "View" on a row and "Print label". **Expect:** 404 (inconsistency 2.5 #1). `[/products/barcodes]`. **Expect:** no Assign button; PNG/SVG download works.

**Flow C-2: Cash sale with scanner and hotkeys**
1. `[/pos]` → scan a demo barcode (or type it quickly + Enter). **Expect:** line added. Scan again. **Expect:** qty 2.
2. F2 → type "tea" → Enter. **Expect:** TEA-950 added.
3. Highlight a line → `+` / `−` → Delete. **Expect:** qty changes, line removed.
4. Manager-only controls (price override, line discount). **Expect:** absent.
5. F4 → search "Ayesha" → select. F9 → cash quick button 1,000 → Complete sale. **Expect:** change computed; receipt printed; sale appears in `[/orders]` as pos / completed / paid; points earned on the customer.
6. **Reprint last receipt**. **Expect:** receipt re-opens.

**Flow C-3: Guest checkout, points, credit limit, hold**
1. Customer panel → **Guest checkout** → name "Walk-in", phone `0300123` (6 digits). **Expect:** phone error. Enter 11 digits + email. Pay cash. **Expect:** receipt shows guest; order has no customer link; email queued to the guest.
2. Select guest, then select an account. **Expect:** guest cleared (mutually exclusive).
3. Account customer with points: redeem 50. **Expect:** "at least 100 points". Redeem 100. **Expect:** total reduced by 100 PKR.
4. Payment method **credit** for an amount above the customer's remaining limit. **Expect:** blocked. For a guest, credit is disabled.
5. Card payment above the due amount. **Expect:** blocked; Complete sale disabled while short.
6. Split: cash 200 + card remainder. **Expect:** two payment rows; sale completes.
7. Build a cart → Ctrl+H. **Expect:** cart cleared, held. Ctrl+Shift+H → resume. **Expect:** same lines and customer restored.
8. F7. **Expect:** camera scanner dialog opens (allow or deny camera). Esc closes.

**Flow C-4: Orders and customers**
1. `[/orders/new]` → walk_in, pickup, customer Ayesha, 2 lines, no deposit → Create. **Expect:** Pending.
2. Order detail → **Cancel** with reason. **Expect:** allowed (pending).
3. Open a Confirmed or Completed order → Cancel. **Expect:** "Cashiers can only cancel pending orders. Ask a manager."
4. Confirm → Record payment cash → Complete on another pending order. **Expect:** allowed; cashier can run the whole happy path.
5. `[/customers]` → New customer. **Expect:** no Credit limit field. Customer detail. **Expect:** no Adjust points, no Activate/Deactivate; Record credit payment visible (enabled only when owed).
6. `[/orders]` filters: Status Open, Channel pos, Payment paid. **Expect:** totals update per filter.

### 6.4 Supplier (vendor) — portal

**Flow V-1: Login, overview and submissions**
1. Log in as `vendor1@star-mart.demo` / `Vendor-Demo-2026!`. **Expect:** `/vendor` overview (no forced change).
2. Open `[/dashboard]`, `[/products]`, `[/pos]` by URL. **Expect:** redirect to `/vendor`.
3. Overview. **Expect:** product count, pending submissions, balance owed, low-stock products with suggested reorder qty (CHEESE-200 etc. if they belong to this supplier).
4. `[/vendor/products]`. **Expect:** only Karachi Wholesale Foods products, read-only.
5. `[/vendor/submit/product]` → Name "Basmati Rice 5kg", SKU, Cost 1,100, Suggested price 1,350, Tax 0, Category "Grocery", image (if Blob configured), note → Submit. **Expect:** `SUP-…` Pending on `[/vendor/submissions]`.
6. `[/vendor/submit/supply]` → invoice ref `KWF-2026-01`, lines: one own product qty 24 (search), another by barcode lookup. Try a barcode of another supplier's product. **Expect:** not found. Submit. **Expect:** Pending supply submission.

**Flow V-2: After the store reviews (run SA-6)**
1. `[/vendor/submissions]`. **Expect:** product Approved, supply Approved, the extra product Rejected with the store's note visible.
2. `[/vendor/products]`. **Expect:** the approved product now listed with stock from the approved delivery.
3. `[/vendor/statement]`. **Expect:** delivered amount from the approved supply; after the store records a payment and a return (SA-5 style), paid and returned lines and a reduced balance.
4. `[/vendor/profile]` → change contact person and phone → Save. **Expect:** store's `[/suppliers/[id]]` shows the new values.
5. `[/vendor/security]` → change password. **Expect:** signed out; new password works; old fails.
6. Store deactivates the supplier (`/suppliers/[id]` → Deactivate). **Expect:** every portal page returns 404 for this vendor until reactivated.

### 6.5 Cross-role scenarios

**Flow X-1: Supplier → store → till → reports**
1. Supplier submits a product and a delivery (V-1).
2. Admin approves both (SA-6). **Expect:** product active, stock = delivered qty.
3. Cashier sells 3 units at POS (C-2). **Expect:** stock −3.
4. Admin: `[/stock/movements?product=…]`. **Expect:** purchase (+qty), sale (−3) with running balance. `[/reports/sales]` top products includes it with gross profit = (price − cost) × 3.
5. Super admin: `[/audit]`. **Expect:** submission.approved, order.created, actor per role.

**Flow X-2: Account lifecycle**
1. Cashier is logged in. Super admin disables the cashier. **Expect:** cashier's next navigation → `/login?reason=expired`; login attempt fails (generic error).
2. Super admin re-enables and resets the password. **Expect:** cashier logs in with the temporary password → forced change → works.
3. Super admin changes the admin's role to cashier. **Expect:** admin is signed out; on re-login sees the cashier sidebar.

**Flow X-3: Low-stock emails**
1. Settings → Stock → Send low-stock emails on; store email set.
2. Admin adjusts a product below its reorder level.
3. Call the cron with the secret:
   ```bash
   curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/jobs/email
   ```
   **Expect:** `low_stock` email to the store and `supplier_low_stock` to the supplier in `[/settings/email]`. Call again immediately. **Expect:** no duplicate within 24 h.

---

## 7. Negative and security checks

| # | Check | Expect |
|---|---|---|
| N1 | `GET /login` headers | CSP and security headers present |
| N2 | Anonymous `GET /orders` | 302 to `/login?callbackUrl=%2Forders` |
| N3 | `/login?callbackUrl=https://evil.example`, `//evil.example`, `/api/x`, `/login` | After login lands on `/dashboard` |
| N4 | Wrong password vs unknown email | Identical error text and similar timing |
| N5 | 5 wrong passwords | Account locked 15 min; audit `login.locked` |
| N6 | 31 login posts from one IP in 15 min | Rate limited (`login.rate_limited`) |
| N7 | 11 posts for the same email | Rate limited |
| N8 | Revoke a session from Users, then act in that browser | `/login?reason=expired` |
| N9 | `GET /api/jobs/email` without secret / wrong secret | 401; with secret 200 |
| N10 | Anonymous `GET /api/invoices/<id>/pdf` and `/api/barcode/<id>` | Redirect to login / 404 |
| N11 | Vendor `GET /api/barcode/<other supplier's product>` | 404 |
| N12 | Cashier `GET /api/products/export` | 403 |
| N13 | Cashier `GET /api/reports/sales` | 404 |
| N14 | Super admin disables self / demotes self | Blocked |
| N15 | Disable the last active super admin | Blocked |
| N16 | Confirm the same order twice from two tabs | Second fails cleanly, no double stock deduction |
| N17 | Use a discount code with usage limit 1 twice | Second attempt "used up"; cancelling the first order frees it |
| N18 | Credit payment above limit | Blocked; credit balance unchanged |
| N19 | Cancel a completed order after the customer spent the earned points | Blocked with explanation |
| N20 | Non-fractional product with qty 1.5 in POS / order / purchase / adjustment | "sold in whole units" error |
| N21 | Image upload of 3 MB or a .gif | Rejected |
| N22 | CSV import with duplicate SKU in file, or > 5000 rows | Preview errors / rejected |

---

## 8. Coverage checklist

Tick each item when exercised at least once by the role(s) indicated.

| Area | Item | Super admin | Admin | Cashier | Supplier |
|---|---|---|---|---|---|
| Auth | Login, generic error, lockout, unlock | ☐ | ☐ | ☐ | ☐ |
| Auth | Forced password change | ☐ | ☐ | ☐ | — |
| Auth | Change password, revoke session, sign out others | ☐ | ☐ | ☐ | ☐ |
| Auth | Sign out, expired session notice | ☐ | ☐ | ☐ | ☐ |
| Dashboard | KPIs, chart, recent orders, low stock | ☐ | ☐ | ☐ | — |
| Products | List search/filter/sort/scan | ☐ | ☐ | ☐ | — |
| Products | Create, edit, generate barcode, image | ☐ | ☐ | 404 | — |
| Products | Archive/restore, delete (and archive-instead) | ☐ | ☐ | — | — |
| Products | Categories CRUD | ☐ | ☐ | 404 | — |
| Products | CSV import preview + commit, export, template | ☐ | ☐ | 403 | — |
| Products | Barcodes page, PNG/SVG, labels (3 layouts) | ☐ | ☐ | ☐ (no labels) | — |
| Stock | Overview, movements, adjust, stock take | ☐ | ☐ | 404 | — |
| Suppliers | CRUD, activate/deactivate, detail tabs | ☐ | ☐ | 404 | — |
| Suppliers | Record payment (purchase / on account), record return | ☐ | ☐ | — | — |
| Purchases | Create draft, receive now, mark received, cancel, pay | ☐ | ☐ | 404 | — |
| Approvals | Approve product, approve supply, reject, stale review | ☐ | ☐ | 404 | — |
| Portal | Overview, products, submit product, submit supply | — | — | — | ☐ |
| Portal | Submissions status + note, statement, profile | — | — | — | ☐ |
| Portal | Redirect off-portal, 404 when supplier inactive | — | — | — | ☐ |
| Customers | Create (dup phone), edit, activate/deactivate | ☐ | ☐ | ☐ (no credit limit) | — |
| Customers | Adjust points, record credit payment | ☐ | ☐ | credit only | — |
| Discounts | Create percent/fixed, dates, usage limit, enable/disable | ☐ | ☐ | 404 | — |
| Orders | Create phone/walk-in, pickup/delivery, deposit, code, points | ☐ | ☐ | ☐ | — |
| Orders | Confirm, ready, out for delivery, complete | ☐ | ☐ | ☐ | — |
| Orders | Record payment (all 4 methods), cancel + refund | ☐ | ☐ | pending only | — |
| Orders | Invoice print, PDF, email | ☐ | ☐ | ☐ | — |
| POS | Scan, search, camera, qty, remove | ☐ | ☐ | ☐ | — |
| POS | Customer, guest checkout, discount code, points | ☐ | ☐ | ☐ | — |
| POS | Price override, line discount | ☐ | ☐ | absent | — |
| POS | Pay: cash/change, card, bank, credit, split, exact | ☐ | ☐ | ☐ | — |
| POS | Hold/resume, reprint, all hotkeys | ☐ | ☐ | ☐ | — |
| Expenses | Category CRUD, expense CRUD, soft delete, CSV | ☐ | ☐ | 404 | — |
| Reports | All 7 reports, every range option, 5 CSV exports | ☐ | ☐ | 404 | — |
| Settings | All 10 groups with validation limits | ☐ | ☐ | 404 | — |
| Settings | Email: test, outbox, retry, run now; cron | ☐ | ☐ | — | — |
| Users | Create (4 roles), role change, disable, reset, unlock, revoke, self/last guards | ☐ | 404 | 404 | — |
| Audit | Events for every action above | ☐ | 404 | 404 | — |
| Security | Table in section 7 | ☐ | ☐ | ☐ | ☐ |
