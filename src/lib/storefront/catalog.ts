import "server-only";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, stockBatches } from "@/db/schema";
import { paisaToDecimalString } from "@/lib/money";
import { getSettings, type Settings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { addDays, daysUntil, expiryStatus, type ExpiryStatus } from "@/lib/stock/expiry";

// Read model for the public storefront API. Only active products are exposed, and
// never cost, supplier or internal fields. "Sellable" stock excludes expired units
// and units expiring within settings.stock.storefrontHideWithinDays.

export type StorefrontExpiry = {
  tracksExpiry: boolean;
  /** Expiry of the units a customer would receive (earliest sellable batch, FEFO). */
  nearestExpiry: string | null;
  daysToExpiry: number | null;
  status: ExpiryStatus;
  /** Ready-to-show text, e.g. "Best before 12 Nov 2026". Null when there is nothing to say. */
  label: string | null;
  shelfLifeDays: number | null;
};

export type StorefrontProduct = {
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
  /** unavailableReason: "expired" = units are on hand but all expired (or inside the hide window). */
  stock: { sellableQty: number; inStock: boolean; lowStock: boolean; unavailableReason: "out_of_stock" | "expired" | null };
  expiry: StorefrontExpiry;
  updatedAt: string;
};

export type StorefrontBatch = { expiry: string | null; qty: number; status: ExpiryStatus };

export const STOREFRONT_SORTS = ["name", "price_asc", "price_desc", "newest", "expiry"] as const;
export type StorefrontSort = (typeof STOREFRONT_SORTS)[number];

type Ctx = { today: string; cutoff: string; warningDays: number; settings: Settings };

async function context(): Promise<Ctx> {
  const settings = await getSettings();
  const today = storeToday(settings.store.timezone);
  return { today, cutoff: addDays(today, settings.stock.storefrontHideWithinDays), warningDays: settings.stock.expiryWarningDays, settings };
}

// Correlated aggregates over a product's open batches.
const sellableBatched = (cutoff: string) =>
  sql`coalesce((select sum(b.qty_remaining) from ${stockBatches} b where b.product_id = ${products.id} and b.qty_remaining > 0 and (b.expiry is null or b.expiry >= ${cutoff}::date)), 0)`;
const allBatched = sql`coalesce((select sum(b.qty_remaining) from ${stockBatches} b where b.product_id = ${products.id} and b.qty_remaining > 0), 0)`;
/** Stock not in any batch (pre-batch or returned) counts as sellable; never more than on hand. */
const sellableQty = (cutoff: string) => sql`greatest(0, least(${products.stockQty}, ${sellableBatched(cutoff)} + greatest(0, ${products.stockQty} - ${allBatched})))`;
const nearestSellable = (cutoff: string) =>
  sql`(select min(b.expiry) from ${stockBatches} b where b.product_id = ${products.id} and b.qty_remaining > 0 and b.expiry >= ${cutoff}::date)`;

function columns(cutoff: string) {
  return {
    id: products.id,
    sku: products.sku,
    barcode: products.barcode,
    name: products.name,
    description: products.description,
    brand: products.brand,
    unit: products.unit,
    allowFractional: products.allowFractional,
    categoryId: products.categoryId,
    categoryName: categories.name,
    imageUrl: products.imageUrl,
    pricePaisa: products.pricePaisa,
    taxRateBps: products.taxRateBps,
    reorderLevel: products.reorderLevel,
    onHand: products.stockQty, // internal: used for unavailableReason, never returned
    tracksExpiry: products.tracksExpiry,
    shelfLifeDays: products.shelfLifeDays,
    expiryWarningDays: products.expiryWarningDays,
    updatedAt: products.updatedAt,
    sellableQty: sql<number>`${sellableQty(cutoff)}`.mapWith(Number),
    nearestExpiry: sql<string | null>`${nearestSellable(cutoff)}::text`,
  };
}

function selectProducts(cutoff: string) {
  return db.select(columns(cutoff)).from(products).leftJoin(categories, eq(categories.id, products.categoryId));
}
type Row = Awaited<ReturnType<typeof selectProducts>>[number];

const LABEL_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function toProduct(r: Row, ctx: Ctx): StorefrontProduct {
  const qty = Math.round(Number(r.sellableQty) * 1000) / 1000;
  const status = expiryStatus(r.nearestExpiry, ctx.today, r.expiryWarningDays ?? ctx.warningDays);
  const days = r.nearestExpiry ? daysUntil(r.nearestExpiry, ctx.today) : null;
  const pretty = r.nearestExpiry ? LABEL_DATE.format(new Date(`${r.nearestExpiry}T00:00:00Z`)) : null;
  const label = !pretty || qty <= 0 ? null : status === "expiring_soon" ? (days === 0 ? "Best before today" : days === 1 ? "Best before tomorrow" : `Best before ${pretty} (${days} days)`) : `Best before ${pretty}`;
  return {
    id: r.id,
    sku: r.sku,
    barcode: r.barcode,
    name: r.name,
    description: r.description,
    brand: r.brand,
    unit: r.unit,
    allowFractional: r.allowFractional,
    category: r.categoryId && r.categoryName ? { id: r.categoryId, name: r.categoryName } : null,
    imageUrl: r.imageUrl,
    price: { amountPaisa: r.pricePaisa, amount: paisaToDecimalString(r.pricePaisa), currency: ctx.settings.currency.code, taxRateBps: r.taxRateBps, taxInclusive: true },
    stock: { sellableQty: qty, inStock: qty > 0, lowStock: qty > 0 && r.reorderLevel > 0 && qty <= r.reorderLevel, unavailableReason: qty > 0 ? null : r.onHand > 0 ? "expired" : "out_of_stock" },
    expiry: { tracksExpiry: r.tracksExpiry, nearestExpiry: qty > 0 ? r.nearestExpiry : null, daysToExpiry: qty > 0 ? days : null, status: qty > 0 ? status : "none", label, shelfLifeDays: r.shelfLifeDays },
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type ListParams = { q?: string; category?: string; inStock?: boolean; expiringSoon?: boolean; sort: StorefrontSort; page: number; pageSize: number };

export async function listStorefrontProducts(params: ListParams) {
  const ctx = await context();
  const filters: SQL[] = [eq(products.status, "active")];
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(products.name, like), ilike(products.brand, like), ilike(products.sku, like), eq(products.barcode, params.q))!);
  }
  if (params.category) filters.push(eq(products.categoryId, params.category));
  if (params.inStock) filters.push(sql`${sellableQty(ctx.cutoff)} > 0`);
  if (params.expiringSoon) filters.push(sql`${sellableQty(ctx.cutoff)} > 0 and ${nearestSellable(ctx.cutoff)} <= ${ctx.today}::date + coalesce(${products.expiryWarningDays}, ${ctx.warningDays})`);
  const where = and(...filters);
  const order = {
    name: [asc(products.name)],
    price_asc: [asc(products.pricePaisa), asc(products.name)],
    price_desc: [desc(products.pricePaisa), asc(products.name)],
    newest: [desc(products.createdAt)],
    expiry: [sql`${nearestSellable(ctx.cutoff)} asc nulls last`, asc(products.name)],
  }[params.sort];
  const [rows, [{ total }]] = await Promise.all([
    selectProducts(ctx.cutoff)
      .where(where)
      .orderBy(...order, asc(products.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ total: count() }).from(products).where(where),
  ]);
  const totalNum = Number(total);
  return {
    data: rows.map((r) => toProduct(r, ctx)),
    pagination: { page: params.page, pageSize: params.pageSize, total: totalNum, pageCount: Math.max(1, Math.ceil(totalNum / params.pageSize)) },
    meta: { today: ctx.today, timezone: ctx.settings.store.timezone, currency: ctx.settings.currency.code, expiryWarningDays: ctx.warningDays, hideWithinDays: ctx.settings.stock.storefrontHideWithinDays },
  };
}

/** One product by id or SKU, with its sellable batches (earliest first). */
export async function getStorefrontProduct(idOrSku: string) {
  const ctx = await context();
  const key = /^[0-9a-f-]{36}$/i.test(idOrSku) ? eq(products.id, idOrSku) : eq(products.sku, idOrSku.toUpperCase());
  const [row] = await selectProducts(ctx.cutoff)
    .where(and(key, eq(products.status, "active")))
    .limit(1);
  if (!row) return null;
  const product = toProduct(row, ctx);
  const batchRows = await db
    .select({ expiry: stockBatches.expiry, qty: sql<number>`sum(${stockBatches.qtyRemaining})`.mapWith(Number) })
    .from(stockBatches)
    .where(and(eq(stockBatches.productId, product.id), sql`${stockBatches.qtyRemaining} > 0`, sql`(${stockBatches.expiry} is null or ${stockBatches.expiry} >= ${ctx.cutoff}::date)`))
    .groupBy(stockBatches.expiry)
    .orderBy(sql`${stockBatches.expiry} asc nulls last`);
  const batches: StorefrontBatch[] = batchRows.map((b) => ({ expiry: b.expiry, qty: Math.round(b.qty * 1000) / 1000, status: expiryStatus(b.expiry, ctx.today, row.expiryWarningDays ?? ctx.warningDays) }));
  return { data: { ...product, batches }, meta: { today: ctx.today, timezone: ctx.settings.store.timezone } };
}

export async function listStorefrontCategories() {
  const rows = await db
    .select({ id: categories.id, name: categories.name, productCount: sql<number>`count(${products.id})::int` })
    .from(categories)
    .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.status, "active")))
    .where(eq(categories.isActive, true))
    .groupBy(categories.id, categories.name)
    .orderBy(asc(categories.name));
  return { data: rows };
}
