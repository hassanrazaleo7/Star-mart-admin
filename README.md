# Star Mart Admin

Back-office and point of sale for Star Mart, built with Next.js 16 (App Router, TypeScript), Auth.js v5, Drizzle ORM on Neon Postgres, and shadcn/ui.

Modules: products and categories (barcodes, labels, CSV import/export), suppliers and purchases with a supplier (vendor) portal and approval queue, stock (adjustments, stock takes, movement ledger), customers with loyalty points and credit accounts, discount codes, orders and invoices (pickup/delivery, PDF, email), a full-screen POS with scanner support, guest checkout and 80 mm receipts, expenses, reports, and Brevo email notifications.

## Setup

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL and AUTH_SECRET (openssl rand -base64 48)
npm run db:migrate              # creates the star_mart schema and all tables
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_NAME="Owner" SEED_ADMIN_PASSWORD='...' npm run seed:admin
npm run seed:demo               # optional sample catalogue, customers, sales, expenses (never in production)
npm run dev                     # http://localhost:3000
```

The seeded account is a `super_admin`. Pass `--must-change-password` to force a new password at first sign-in, `--reset-password` to rotate an existing account's password (this also signs it out everywhere), or `--password-stdin` to avoid putting the password on the command line.

All application tables live in the Postgres schema `star_mart`, so the app can share a database with other schemas without name collisions.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm run db:generate` | Generate SQL migrations from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (`drizzle/`) |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed:admin` | Create or reset an admin account |
| `npm run seed:demo` | Idempotent demo data (categories, suppliers + vendor logins, 20 products, customers, purchases, 30 days of sales, expenses) |
| `npm run check:pricing` | Assertions for the order pricing engine (rounding, discount allocation, points, settlement) |
| `npm run check:expiry` | Assertions for expiry status and FEFO batch allocation |
| `npm run db:reset -- --yes` | Drop the `star_mart` and `drizzle` schemas. Requires `DB_RESET_CONFIRM=<database name>`; irreversible |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `AUTH_SECRET` | yes | Auth.js JWT/cookie secret (32+ chars) |
| `AUTH_URL` | production | Public origin (HTTPS) |
| `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY` | no | Vercel Blob store and upload-completion verification settings. The store must be created with **Public** access (product images are served by URL; a store's access mode cannot be changed after creation) |
| `BLOB_READ_WRITE_TOKEN` | no | Required for local Blob uploads; deployed Vercel functions can use OIDC when enabled. Product image uploads are disabled unless a write credential is available |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | no | Brevo transactional email. Until set, queued mail fails with a clear reason (or is logged when dry run is on) |
| `BREVO_DRY_RUN` | no | `true` renders and logs emails instead of sending them |
| `CRON_SECRET` | no | Protects `/api/jobs/email` (`x-cron-secret` header or `Authorization: Bearer`) |
| `PASSWORD_HIBP_CHECK` | no | `true` rejects passwords found in Have I Been Pwned |
| `STOREFRONT_API_KEY` | for the storefront | Enables the read-only public API (`/api/public/*`); clients send it as `x-api-key`. Without it the API answers 503 in production (open in development) |
| `STOREFRONT_ORIGINS` | no | Comma-separated origins allowed to call the public API from a browser (CORS) |

## Roles

| Role | Access |
|---|---|
| `super_admin` | Everything, plus Users and the audit log |
| `admin` | All store modules: catalogue, supply, finance, settings |
| `cashier` | POS, orders, customers, discounts (read), products (read). No prices overrides, no finance |
| `vendor` | Supplier portal only (`/vendor`): own products, product and delivery submissions, statement, profile |

Customers are records without a login. Vendor accounts are created on the Users page and linked to a supplier.

## How the modules fit together

- **Money** is stored as integer paisa (`*_paisa`). Shelf prices are tax inclusive; each product carries a `tax_rate_bps` and the tax portion is derived on every sale line. Quantities are `numeric(12,3)`; products opt into fractional quantities.
- **Stock** changes only through `stock_movements` (`src/lib/stock/movements.ts`), which also maintain the cached `products.stock_qty`. Purchases, approved supplier deliveries, POS sales, confirmed orders, cancellations, adjustments and stock takes all write movements.
- **Orders** go `pending → confirmed → ready → out_for_delivery → completed` (or `cancelled`). Confirming reserves stock and issues the invoice; completing requires full payment and credits loyalty points. POS sales are created already completed. Cancelling returns stock, reverses points and credit, refunds payments and voids the invoice.
- **Atomicity on Neon HTTP**: every multi-row write is a single `db.batch` (one transaction). Conditional writes use the guarded-CTE pattern in `src/lib/db/guarded.ts`: a `WITH g AS (UPDATE … WHERE <guard> RETURNING …)` whose empty result violates a NOT NULL column in the dependent statement, so stale transitions, overdrawn credit, insufficient points or stock, and exhausted discount codes roll the whole batch back with a precise error message.
- **Loyalty**: 1 point per 100 PKR paid (after discounts, excluding redeemed value), 1 point = 1 PKR, minimum 100 points to redeem. All three values are editable in Settings → Loyalty.
- **Emails** are queued in `email_outbox` together with the business write and sent by `src/lib/email/worker.ts`: a few rows right after the response (`after()`), the rest by the cron job. Low-stock digests go to the store email (or super admins) and to each supplier, at most once per product per 24 hours.
- **Barcodes page** (`/products/barcodes`): every product with its barcode preview, symbology and price; download each barcode as PNG (3× scale) or SVG for later printing, print labels for a page, and find products that still need a code.
- **Barcodes**: USB keyboard-wedge scanners work on every list, the POS and the order editor (`src/hooks/use-barcode-scanner.ts`); the camera scanner uses the pure-JS ZXing decoder so the strict CSP stays intact. In-store EAN-13 codes are generated from the prefix in Settings. Labels print from `/print/labels` (A4 65/24 per sheet or 50×30 mm thermal).
- **Guest checkout**: the POS customer panel offers "Guest checkout" next to the account picker. Name, phone and email are optional, are stored on the sale only (no customer record, no points or credit), print on the receipt, and an email address gets the receipt by email.
- **Receipts and invoices**: the POS prints an 80 mm receipt through a hidden same-origin iframe (`/print/pos/receipt/<id>`); invoices print as A4 (`/print/invoices/<id>`) and download as PDF (`/api/invoices/<id>/pdf`, rendered with `@react-pdf/renderer`).

## Product expiry (batches, FEFO)

Every received lot is a row in `stock_batches` (lot code, expiry, remaining qty, unit cost, supplier, purchase line). The rules:

- **What creates a batch:** purchases, approved supplier deliveries, stock-in adjustments, stock-take surpluses, opening stock and returned sales.
- **How stock leaves:** sales, write-offs, stock-take shortages and purchase returns take the earliest expiry first (`src/lib/stock/batches.ts`). A cancelled order puts the units back into the batches they were sold from.
- **Keeping totals in step:** `applyStockMovements` moves `qty_remaining` together with `products.stock_qty` in the same batch. A per-batch guard makes a stale allocation roll the whole write back.
- **Products:** a product can be marked perishable (`tracks_expiry`, which makes an expiry mandatory on receipt) and given a shelf life that pre-fills it, plus its own warning window.
- **Settings → Stock:** expiry warning days, block sales of expired stock (default on), daily expiry alert emails, and how many days before expiry units disappear from the storefront.
- **Screens:** `/stock/expiry` (expired / expiring soon / missing dates, edit a batch, bulk write-off, CSV), batches on each product's edit page, dashboard card, expiry section in Reports → Stock, POS warning toast.
- **Migration:** the `0002` migration moves existing stock into one undated `OPENING` batch per product. Date them from the Expiry page ("Missing expiry" tab for perishables).

The customer storefront reads `/api/public/products` (sellable quantity excludes expired units, plus the earliest expiry a customer would receive). [`docs/STOREFRONT-EXPIRY-PROMPT.md`](docs/STOREFRONT-EXPIRY-PROMPT.md) is a hand-off brief for building the storefront side.

## Shifts and closings

Every POS sale belongs to a **shift**: the cashier opens one with the opening float (the POS blocks sales until then), sells, and closes it by counting the drawer. The closing records expected cash (float + cash received − cash refunds), counted cash and the variance, plus totals per payment method. `/shifts` lists closings with filters (cashier, status, date range, variance) and a CSV export; cashiers see only their own shifts. Managers can **reopen** a closed shift to correct a count; the reopen and the new close are audited. `/print/shifts/<id>` prints an A4 closing sheet.

## Cron

`GET` or `POST /api/jobs/email` drains the outbox and runs the low-stock and expiry scans. `vercel.json` schedules it every 5 minutes on Vercel (Vercel sends `Authorization: Bearer $CRON_SECRET`). Elsewhere, call it from any scheduler with the `x-cron-secret` header.

## Security model

- **Credentials only**: email + password, hashed with Argon2id (19 MiB, t=2, p=1). Unknown emails are verified against a dummy hash so timing is uniform. Every failure returns the same generic message.
- **Brute-force protection** (database-backed, works on serverless): 30 attempts per IP and 10 per email per 15 minutes; after 5 failed logins an account locks for 15 min, doubling per extra failure up to 24 h. A super admin can unlock from the Users page.
- **Revocable sessions despite JWT cookies**: every login creates an `admin_sessions` row whose id travels in the encrypted JWT. `src/lib/auth/session.ts` (`requireSession` / `requireRole` / `requireVendor`) checks that row on every page and server action: revoked, expired (12 h absolute), idle (30 min), disabled user, or stale `session_version` all end the session. Password changes bump `session_version`, which invalidates every token at once.
- **Proxy** (`src/proxy.ts`): redirects anonymous users to `/login`, keeps vendors inside `/vendor`, sets a per-request nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`), HSTS (production), `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` (needed for receipt printing), `nosniff`, Referrer-Policy, Permissions-Policy (`camera=(self)` for the scanner), COOP. The proxy never touches the database; the data-access layer is the authority.
- **Cookies**: `httpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix in production.
- **Open-redirect protection** for `callbackUrl` (`src/lib/security/redirect.ts`).
- **Audit log** (`admin_audit_logs`): logins, password changes, session revocations, user management, and every business action (products, purchases, stock, submissions, customers, loyalty, discounts, orders, payments, invoices, expenses, emails, exports).
- **Password policy**: 12–128 characters, must not contain the email. Set `PASSWORD_HIBP_CHECK=true` to also reject passwords found in the Have I Been Pwned corpus (k-anonymity lookup).
- **Environment validation** at boot (`src/env.ts`, `src/instrumentation.ts`).

## Project layout

```
src/auth.ts, src/auth.config.ts   Auth.js (full instance / DB-free config for the proxy)
src/proxy.ts                      route gate, role redirects, security headers
src/db/schema.ts                  Drizzle schema (Postgres schema `star_mart`, 27 tables)
src/lib/auth/                     authenticate, lockout, rate-limit, sessions-store, session (DAL), audit, password
src/lib/{money,documents,settings,rbac,format}.ts
src/lib/db/guarded.ts             guarded-CTE batch helpers
src/lib/products|suppliers|purchases|stock|customers|discounts|loyalty|orders|invoices|pdf|expenses|reports|email
src/app/(auth)/login              sign-in
src/app/(admin)/                  sidebar shell: dashboard, products, suppliers, purchases, approvals, stock, customers,
                                  discounts, orders, expenses, reports, settings (+ email), users, audit
src/app/(vendor)/vendor           supplier portal
src/app/(pos)/pos                 full-screen point of sale
src/app/(print)/print             labels, invoices, POS receipts (bare pages for printing)
src/app/api/                      auth, session, blob upload, barcode images, product export, POS lookups,
                                  invoice PDF, report CSVs, email cron job
scripts/                          seed-admin, seed-demo, db-reset, check-pricing
```

## Deployment notes

- Serve over HTTPS and set `AUTH_URL` to the public origin. The production cookies use the `__Host-` prefix and HSTS is enabled, so plain-http production will not log in. Camera scanning also needs HTTPS off localhost.
- `@node-rs/argon2` ships native binaries for macOS (arm64) and Linux (x64/arm64 glibc); deploy to one of those targets.
- Keep `AUTH_SECRET` private; rotating it signs everyone out.
- Thermal receipts assume an 80 mm roll with a 72 mm printable width; adjust the constants at the top of `src/app/(print)/print/pos/receipt/[orderId]/page.tsx` for other printers.
