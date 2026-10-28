import { and, asc, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, categories, products, stockMovements, suppliers } from "@/db/schema";

export const STOCK_PAGE_SIZE = 50;

export async function stockOverview(params: { q?: string; category?: string; supplier?: string; low?: boolean; page?: number }) {
  const filters: SQL[] = [eq(products.status, "active")];
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(products.name, like), ilike(products.sku, like), eq(products.barcode, params.q))!);
  }
  if (params.category) filters.push(eq(products.categoryId, params.category));
  if (params.supplier) filters.push(eq(products.supplierId, params.supplier));
  if (params.low) filters.push(sql`${products.reorderLevel} > 0 and ${products.stockQty} <= ${products.reorderLevel}`);
  const where = and(...filters);
  const page = params.page ?? 1;
  const [rows, [{ total }], [summary]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        stockQty: products.stockQty,
        reorderLevel: products.reorderLevel,
        reorderQty: products.reorderQty,
        costPaisa: products.costPaisa,
        categoryName: categories.name,
        supplierName: suppliers.name,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
      .where(where)
      .orderBy(asc(products.name))
      .limit(STOCK_PAGE_SIZE)
      .offset((page - 1) * STOCK_PAGE_SIZE),
    db.select({ total: count() }).from(products).where(where),
    db
      .select({
        valuation: sql<string>`coalesce(sum(${products.stockQty} * ${products.costPaisa}), 0)`,
        lowCount: sql<number>`count(*) filter (where ${products.reorderLevel} > 0 and ${products.stockQty} <= ${products.reorderLevel} and ${products.stockQty} > 0)::int`,
        outCount: sql<number>`count(*) filter (where ${products.stockQty} <= 0)::int`,
        activeCount: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(eq(products.status, "active")),
  ]);
  return {
    rows,
    total: Number(total),
    page,
    pageCount: Math.max(1, Math.ceil(Number(total) / STOCK_PAGE_SIZE)),
    summary: { valuationPaisa: Math.round(Number(summary?.valuation ?? 0)), lowCount: summary?.lowCount ?? 0, outCount: summary?.outCount ?? 0, activeCount: summary?.activeCount ?? 0 },
  };
}

export async function listMovements(params: { product?: string; kind?: string; from?: string; to?: string; page?: number }) {
  const filters: SQL[] = [];
  if (params.product) filters.push(eq(stockMovements.productId, params.product));
  if (params.kind) filters.push(eq(stockMovements.kind, params.kind as "sale"));
  if (params.from) filters.push(gte(stockMovements.createdAt, new Date(`${params.from}T00:00:00Z`)));
  if (params.to) filters.push(lte(stockMovements.createdAt, new Date(`${params.to}T23:59:59.999Z`)));
  const where = filters.length ? and(...filters) : undefined;
  const page = params.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        createdAt: stockMovements.createdAt,
        qtyDelta: stockMovements.qtyDelta,
        kind: stockMovements.kind,
        refType: stockMovements.refType,
        refId: stockMovements.refId,
        unitCostPaisa: stockMovements.unitCostPaisa,
        reason: stockMovements.reason,
        note: stockMovements.note,
        productId: stockMovements.productId,
        productName: products.name,
        sku: products.sku,
        unit: products.unit,
        actorName: adminUsers.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .leftJoin(adminUsers, eq(adminUsers.id, stockMovements.createdBy))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(STOCK_PAGE_SIZE)
      .offset((page - 1) * STOCK_PAGE_SIZE),
    db.select({ total: count() }).from(stockMovements).where(where),
  ]);

  // Running balance only makes sense for a single product: compute from the ledger tail.
  let running: number[] | null = null;
  if (params.product && rows.length) {
    const [after] = await db
      .select({ sum: sql<string>`coalesce(sum(${stockMovements.qtyDelta}), 0)` })
      .from(stockMovements)
      .where(and(eq(stockMovements.productId, params.product), sql`(${stockMovements.createdAt}, ${stockMovements.id}) > (${rows[0].createdAt}, ${rows[0].id})`));
    const [current] = await db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, params.product));
    let balance = Number(current?.stockQty ?? 0) - Number(after?.sum ?? 0);
    running = rows.map((r) => {
      const b = balance;
      balance -= r.qtyDelta;
      return b;
    });
  }
  return { rows: rows.map((r, i) => ({ ...r, balance: running ? running[i] : null })), total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / STOCK_PAGE_SIZE)) };
}

export async function productBrief(id: string) {
  const [row] = await db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stockQty: products.stockQty, costPaisa: products.costPaisa, allowFractional: products.allowFractional })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return row ?? null;
}

export async function listCountSheet(params: { category?: string; supplier?: string }) {
  const filters: SQL[] = [eq(products.status, "active")];
  if (params.category) filters.push(eq(products.categoryId, params.category));
  if (params.supplier) filters.push(eq(products.supplierId, params.supplier));
  return db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stockQty: products.stockQty, costPaisa: products.costPaisa, allowFractional: products.allowFractional })
    .from(products)
    .where(and(...filters))
    .orderBy(asc(products.name))
    .limit(1000);
}
