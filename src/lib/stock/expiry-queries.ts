import "server-only";
import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, purchaseItems, purchases, stockBatches, stockMovements, suppliers } from "@/db/schema";

// Read models for expiry screens. `today` is the store-local date (storeToday) and
// `warningDays` the store default; a product's own expiry_warning_days wins.

export const EXPIRY_VIEWS = ["expired", "soon", "missing", "open", "all"] as const;
export type ExpiryView = (typeof EXPIRY_VIEWS)[number];
export const BATCHES_PAGE_SIZE = 50;

const warnDays = (storeDefault: number) => sql`coalesce(${products.expiryWarningDays}, ${storeDefault})`;

/** SQL predicates for each view, over stock_batches joined to products. */
export function expiryViewFilter(view: ExpiryView, today: string, storeDefault: number): SQL | undefined {
  const open = gt(stockBatches.qtyRemaining, 0);
  switch (view) {
    case "expired":
      return and(open, sql`${stockBatches.expiry} < ${today}::date`);
    case "soon":
      return and(open, sql`${stockBatches.expiry} >= ${today}::date and ${stockBatches.expiry} <= ${today}::date + ${warnDays(storeDefault)}`);
    case "missing":
      return and(open, isNull(stockBatches.expiry), eq(products.tracksExpiry, true));
    case "open":
      return open;
    case "all":
      return undefined;
  }
}

export type BatchRow = Awaited<ReturnType<typeof listBatches>>["rows"][number];

export async function listBatches(params: { view: ExpiryView; today: string; warningDays: number; productId?: string; q?: string; category?: string; supplier?: string; page?: number; pageSize?: number }) {
  const filters: (SQL | undefined)[] = [expiryViewFilter(params.view, params.today, params.warningDays)];
  if (params.productId) filters.push(eq(stockBatches.productId, params.productId));
  if (params.category) filters.push(eq(products.categoryId, params.category));
  if (params.supplier) filters.push(eq(stockBatches.supplierId, params.supplier));
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(stockBatches.batchCode, like), eq(products.barcode, params.q)));
  }
  const where = and(...filters.filter((f): f is SQL => !!f));
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? BATCHES_PAGE_SIZE;
  const [rows, [{ total }], [totals]] = await Promise.all([
    db
      .select({
        id: stockBatches.id,
        productId: stockBatches.productId,
        productName: products.name,
        sku: products.sku,
        unit: products.unit,
        tracksExpiry: products.tracksExpiry,
        expiryWarningDays: products.expiryWarningDays,
        batchCode: stockBatches.batchCode,
        expiry: stockBatches.expiry,
        source: stockBatches.source,
        receivedQty: stockBatches.receivedQty,
        qtyRemaining: stockBatches.qtyRemaining,
        unitCostPaisa: sql<number>`coalesce(${stockBatches.unitCostPaisa}, ${products.costPaisa})`.mapWith(Number),
        createdAt: stockBatches.createdAt,
        writtenOffAt: stockBatches.writtenOffAt,
        supplierName: suppliers.name,
        purchaseId: purchases.id,
        purchaseNumber: purchases.number,
      })
      .from(stockBatches)
      .innerJoin(products, eq(products.id, stockBatches.productId))
      .leftJoin(suppliers, eq(suppliers.id, stockBatches.supplierId))
      .leftJoin(purchaseItems, eq(purchaseItems.id, stockBatches.purchaseItemId))
      .leftJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
      .where(where)
      .orderBy(sql`${stockBatches.expiry} asc nulls last`, asc(products.name), desc(stockBatches.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(stockBatches).innerJoin(products, eq(products.id, stockBatches.productId)).where(where),
    db
      .select({
        qty: sql<number>`coalesce(sum(${stockBatches.qtyRemaining}), 0)`.mapWith(Number),
        value: sql<number>`coalesce(sum(${stockBatches.qtyRemaining} * coalesce(${stockBatches.unitCostPaisa}, ${products.costPaisa})), 0)`.mapWith(Number),
      })
      .from(stockBatches)
      .innerJoin(products, eq(products.id, stockBatches.productId))
      .where(where),
  ]);
  return {
    rows,
    total: Number(total),
    page,
    pageCount: Math.max(1, Math.ceil(Number(total) / pageSize)),
    totals: { qty: totals?.qty ?? 0, valuePaisa: Math.round(totals?.value ?? 0) },
  };
}

/** Headline numbers for the dashboard, stock report and Expiry page. */
export async function expirySummary(today: string, warningDays: number, writtenOffSinceDays = 30) {
  const [[row], [writeOff]] = await Promise.all([
    db
      .select({
        expiredBatches: sql<number>`count(*) filter (where ${stockBatches.expiry} < ${today}::date)::int`,
        expiredValue: sql<number>`coalesce(sum(${stockBatches.qtyRemaining} * coalesce(${stockBatches.unitCostPaisa}, ${products.costPaisa})) filter (where ${stockBatches.expiry} < ${today}::date), 0)`.mapWith(Number),
        soonBatches: sql<number>`count(*) filter (where ${stockBatches.expiry} >= ${today}::date and ${stockBatches.expiry} <= ${today}::date + ${warnDays(warningDays)})::int`,
        soonValue: sql<number>`coalesce(sum(${stockBatches.qtyRemaining} * coalesce(${stockBatches.unitCostPaisa}, ${products.costPaisa})) filter (where ${stockBatches.expiry} >= ${today}::date and ${stockBatches.expiry} <= ${today}::date + ${warnDays(warningDays)}), 0)`.mapWith(Number),
        missingBatches: sql<number>`count(*) filter (where ${stockBatches.expiry} is null and ${products.tracksExpiry})::int`,
        productsExpired: sql<number>`count(distinct ${stockBatches.productId}) filter (where ${stockBatches.expiry} < ${today}::date)::int`,
        productsSoon: sql<number>`count(distinct ${stockBatches.productId}) filter (where ${stockBatches.expiry} >= ${today}::date and ${stockBatches.expiry} <= ${today}::date + ${warnDays(warningDays)})::int`,
      })
      .from(stockBatches)
      .innerJoin(products, eq(products.id, stockBatches.productId))
      .where(and(gt(stockBatches.qtyRemaining, 0), eq(products.status, "active"))),
    db
      .select({
        value: sql<number>`coalesce(sum(-${stockMovements.qtyDelta} * coalesce(${stockMovements.unitCostPaisa}, 0)), 0)`.mapWith(Number),
        qty: sql<number>`coalesce(sum(-${stockMovements.qtyDelta}), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .where(and(eq(stockMovements.reason, "expired"), sql`${stockMovements.createdAt} >= now() - make_interval(days => ${writtenOffSinceDays})`)),
  ]);
  return {
    expiredBatches: row?.expiredBatches ?? 0,
    expiredValuePaisa: Math.round(row?.expiredValue ?? 0),
    soonBatches: row?.soonBatches ?? 0,
    soonValuePaisa: Math.round(row?.soonValue ?? 0),
    missingBatches: row?.missingBatches ?? 0,
    productsExpired: row?.productsExpired ?? 0,
    productsSoon: row?.productsSoon ?? 0,
    writtenOffValuePaisa: Math.round(writeOff?.value ?? 0),
    writtenOffQty: writeOff?.qty ?? 0,
    writtenOffSinceDays,
  };
}

/** Earliest-expiring open batches, for the dashboard card. */
export async function soonestExpiring(today: string, warningDays: number, limit = 6) {
  return db
    .select({ id: stockBatches.id, productId: stockBatches.productId, productName: products.name, unit: products.unit, expiry: stockBatches.expiry, qtyRemaining: stockBatches.qtyRemaining, expiryWarningDays: products.expiryWarningDays })
    .from(stockBatches)
    .innerJoin(products, eq(products.id, stockBatches.productId))
    .where(and(gt(stockBatches.qtyRemaining, 0), eq(products.status, "active"), sql`${stockBatches.expiry} <= ${today}::date + ${warnDays(warningDays)}`))
    .orderBy(asc(stockBatches.expiry))
    .limit(limit);
}

export async function categoryAndSupplierOptions() {
  const [cats, sups] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
  ]);
  return { categories: cats, suppliers: sups };
}
