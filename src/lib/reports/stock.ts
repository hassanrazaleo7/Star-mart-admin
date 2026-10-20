import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, stockMovements, suppliers } from "@/db/schema";

const num = (v: unknown) => Number(v ?? 0);

export async function stockReport(deadDays = 30) {
  const active = eq(products.status, "active");
  const [[summary], lowStock, deadStock, byCategory] = await Promise.all([
    db.select({ valuation: sql<string>`coalesce(sum(${products.stockQty} * ${products.costPaisa}), 0)`, retail: sql<string>`coalesce(sum(${products.stockQty} * ${products.pricePaisa}), 0)`, units: sql<string>`coalesce(sum(${products.stockQty}), 0)`, skus: sql<number>`count(*)::int`, low: sql<number>`count(*) filter (where ${products.reorderLevel} > 0 and ${products.stockQty} <= ${products.reorderLevel} and ${products.stockQty} > 0)::int`, out: sql<number>`count(*) filter (where ${products.stockQty} <= 0)::int` }).from(products).where(active),
    db.select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stockQty: products.stockQty, reorderLevel: products.reorderLevel, reorderQty: products.reorderQty, supplier: suppliers.name, supplierId: products.supplierId }).from(products).leftJoin(suppliers, eq(suppliers.id, products.supplierId)).where(and(active, gt(products.reorderLevel, 0), lte(products.stockQty, products.reorderLevel))).orderBy(asc(products.stockQty), asc(products.name)).limit(100),
    db.select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stockQty: products.stockQty, valuePaisa: sql<string>`${products.stockQty} * ${products.costPaisa}`, lastSale: sql<Date | null>`(select max(created_at) from ${stockMovements} m where m.product_id = ${products}.id and m.kind = 'sale')` }).from(products).where(and(active, gt(products.stockQty, 0), sql`not exists (select 1 from ${stockMovements} m where m.product_id = ${products}.id and m.kind = 'sale' and m.created_at > now() - make_interval(days => ${deadDays}))`)).orderBy(desc(sql`${products.stockQty} * ${products.costPaisa}`)).limit(50),
    db.select({ category: sql<string>`coalesce(${categories.name}, 'Uncategorised')`, skus: sql<number>`count(*)::int`, valuationPaisa: sql<string>`coalesce(sum(${products.stockQty} * ${products.costPaisa}), 0)` }).from(products).leftJoin(categories, eq(categories.id, products.categoryId)).where(active).groupBy(categories.name).orderBy(desc(sql`sum(${products.stockQty} * ${products.costPaisa})`)),
  ]);
  return {
    kpis: { valuationPaisa: Math.round(num(summary?.valuation)), retailValuePaisa: Math.round(num(summary?.retail)), units: num(summary?.units), skus: summary?.skus ?? 0, lowCount: summary?.low ?? 0, outCount: summary?.out ?? 0 },
    lowStock,
    deadStock: deadStock.map((r) => ({ ...r, valuePaisa: Math.round(num(r.valuePaisa)) })),
    byCategory: byCategory.map((r) => ({ category: r.category, skus: r.skus, valuationPaisa: Math.round(num(r.valuationPaisa)) })),
    deadDays,
  };
}

export async function stockRows() {
  return db
    .select({ sku: products.sku, name: products.name, barcode: products.barcode, category: categories.name, supplier: suppliers.name, unit: products.unit, stockQty: products.stockQty, reorderLevel: products.reorderLevel, costPaisa: products.costPaisa, pricePaisa: products.pricePaisa })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(eq(products.status, "active"))
    .orderBy(asc(products.name))
    .limit(20_000);
}
