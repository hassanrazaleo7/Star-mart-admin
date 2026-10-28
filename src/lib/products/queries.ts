import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, stockBatches, storeSettings, suppliers } from "@/db/schema";
import type { ProductListParams } from "@/lib/validation/products";

export const PRODUCTS_PAGE_SIZE = 25;

export async function listProducts(params: ProductListParams, scope: { supplierId?: string; today?: string; warningDays?: number } = {}) {
  const filters: SQL[] = [];
  if (params.status !== "all") filters.push(eq(products.status, params.status));
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(products.name, like), ilike(products.sku, like), eq(products.barcode, params.q))!);
  }
  if (params.category) filters.push(eq(products.categoryId, params.category));
  if (params.supplier) filters.push(eq(products.supplierId, params.supplier));
  if (scope.supplierId) filters.push(eq(products.supplierId, scope.supplierId));
  if (params.low) filters.push(sql`${products.reorderLevel} > 0 and ${products.stockQty} <= ${products.reorderLevel}`);
  if (params.expiry) {
    const today = sql`${scope.today ?? null}::date`;
    const window = sql`coalesce(${products.expiryWarningDays}, ${scope.warningDays ?? 30})`;
    const condition = {
      expired: sql`b.expiry < ${today}`,
      soon: sql`b.expiry >= ${today} and b.expiry <= ${today} + ${window}`,
      missing: sql`b.expiry is null and ${products.tracksExpiry}`,
    }[params.expiry];
    filters.push(sql`exists (select 1 from ${stockBatches} b where b.product_id = ${products.id} and b.qty_remaining > 0 and ${condition})`);
  }
  const where = filters.length ? and(...filters) : undefined;

  const sortColumn = {
    name: products.name,
    sku: products.sku,
    price: products.pricePaisa,
    stock: products.stockQty,
    updated: products.updatedAt,
  }[params.sort];
  const order = params.dir === "desc" ? desc(sortColumn) : asc(sortColumn);
  const offset = (params.page - 1) * PRODUCTS_PAGE_SIZE;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        barcode: products.barcode,
        name: products.name,
        unit: products.unit,
        pricePaisa: products.pricePaisa,
        costPaisa: products.costPaisa,
        stockQty: products.stockQty,
        reorderLevel: products.reorderLevel,
        status: products.status,
        imageUrl: products.imageUrl,
        updatedAt: products.updatedAt,
        tracksExpiry: products.tracksExpiry,
        expiryWarningDays: products.expiryWarningDays,
        nearestExpiry: SEARCH_EXPIRY_COLUMNS.nearestExpiry,
        categoryName: categories.name,
        supplierName: suppliers.name,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
      .where(where)
      .orderBy(order, asc(products.id))
      .limit(PRODUCTS_PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return { rows, total: Number(total), page: params.page, pageCount: Math.max(1, Math.ceil(Number(total) / PRODUCTS_PAGE_SIZE)) };
}

export async function getProduct(id: string) {
  return db.query.products.findFirst({ where: eq(products.id, id) });
}

export async function listCategories(activeOnly = false) {
  return db
    .select()
    .from(categories)
    .where(activeOnly ? eq(categories.isActive, true) : undefined)
    .orderBy(asc(categories.name));
}

export async function listSupplierOptions() {
  return db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(asc(suppliers.name));
}

export type ProductSearchRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  allowFractional: boolean;
  pricePaisa: number;
  costPaisa: number;
  taxRateBps: number;
  stockQty: number;
  tracksExpiry: boolean;
  shelfLifeDays: number | null;
  /** Earliest expiry among open batches (may be in the past). */
  nearestExpiry: string | null;
  /** Units in open batches whose expiry is before `today` (store-local, see expiredQtySql). */
  expiredQty: number;
};

// Today in the store timezone is resolved in SQL so these lookups need no settings read.
const storeTodaySql = sql`(now() at time zone coalesce((select value->>'timezone' from ${storeSettings} where key = 'store'), 'Asia/Karachi'))::date`;

const SEARCH_EXPIRY_COLUMNS = {
  tracksExpiry: products.tracksExpiry,
  shelfLifeDays: products.shelfLifeDays,
  nearestExpiry: sql<string | null>`(select min(b.expiry)::text from ${stockBatches} b where b.product_id = ${products.id} and b.qty_remaining > 0)`,
  expiredQty: sql<number>`coalesce((select sum(b.qty_remaining) from ${stockBatches} b where b.product_id = ${products.id} and b.qty_remaining > 0 and b.expiry < ${storeTodaySql}), 0)`.mapWith(Number),
};

/** Lightweight product lookup for POS, order and purchase editors. */
export async function searchProducts(query: string, options: { limit?: number; supplierId?: string; includeInactive?: boolean } = {}): Promise<ProductSearchRow[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const filters: SQL[] = [or(ilike(products.name, like), ilike(products.sku, like), eq(products.barcode, q))!];
  if (!options.includeInactive) filters.push(eq(products.status, "active"));
  if (options.supplierId) filters.push(eq(products.supplierId, options.supplierId));
  return db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      unit: products.unit,
      allowFractional: products.allowFractional,
      pricePaisa: products.pricePaisa,
      costPaisa: products.costPaisa,
      taxRateBps: products.taxRateBps,
      stockQty: products.stockQty,
      ...SEARCH_EXPIRY_COLUMNS,
    })
    .from(products)
    .where(and(...filters))
    .orderBy(sql`case when ${products.barcode} = ${q} then 0 when ${products.sku} ilike ${q} then 1 else 2 end`, asc(products.name))
    .limit(options.limit ?? 20);
}

export async function findProductByBarcode(code: string): Promise<ProductSearchRow | null> {
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      unit: products.unit,
      allowFractional: products.allowFractional,
      pricePaisa: products.pricePaisa,
      costPaisa: products.costPaisa,
      taxRateBps: products.taxRateBps,
      stockQty: products.stockQty,
      ...SEARCH_EXPIRY_COLUMNS,
    })
    .from(products)
    .where(and(eq(products.status, "active"), or(eq(products.barcode, code), eq(products.sku, code.toUpperCase()))))
    .limit(1);
  return row ?? null;
}

export const BARCODES_PAGE_SIZE = 50;

/** Products with (or, when asked, without) a barcode for the Barcodes page. */
export async function listBarcodes(params: { q?: string; category?: string; show?: "assigned" | "missing" | "all"; page?: number }) {
  const filters: SQL[] = [sql`${products.status} <> 'archived'`];
  if (params.show === "missing") filters.push(isNull(products.barcode));
  else if (params.show !== "all") filters.push(isNotNull(products.barcode));
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.barcode, like))!);
  }
  if (params.category) filters.push(eq(products.categoryId, params.category));
  const where = and(...filters);
  const page = params.page ?? 1;
  const [rows, [{ total }], [counts]] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, sku: products.sku, barcode: products.barcode, pricePaisa: products.pricePaisa, status: products.status, categoryName: categories.name, supplierId: products.supplierId })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(asc(products.name))
      .limit(BARCODES_PAGE_SIZE)
      .offset((page - 1) * BARCODES_PAGE_SIZE),
    db.select({ total: count() }).from(products).where(where),
    db.select({ assigned: sql<number>`count(*) filter (where ${products.barcode} is not null)::int`, missing: sql<number>`count(*) filter (where ${products.barcode} is null)::int` }).from(products).where(sql`${products.status} <> 'archived'`),
  ]);
  return { rows, total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / BARCODES_PAGE_SIZE)), assigned: counts?.assigned ?? 0, missing: counts?.missing ?? 0 };
}
