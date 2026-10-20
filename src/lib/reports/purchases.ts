import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, purchaseItems, purchases, suppliers } from "@/db/schema";
import { dayBucket, fillDays, rangeWhere, type DateRange } from "./range";

const receivedIn = (range: DateRange, tz: string) => and(eq(purchases.status, "received"), rangeWhere(purchases.receivedAt, range, tz))!;
const num = (v: unknown) => Number(v ?? 0);

export async function purchasesReport(range: DateRange, tz: string) {
  const where = receivedIn(range, tz);
  const [[kpi], byDayRaw, bySupplier, topProducts] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${purchases.totalPaisa}), 0)`, paid: sql<string>`coalesce(sum(${purchases.paidPaisa}), 0)`, n: sql<number>`count(*)::int` }).from(purchases).where(where),
    db.select({ day: dayBucket(purchases.receivedAt, tz), purchasedPaisa: sql<string>`coalesce(sum(${purchases.totalPaisa}), 0)`, purchases: sql<number>`count(*)::int` }).from(purchases).where(where).groupBy(sql`day`).orderBy(sql`day`),
    db.select({ supplierId: purchases.supplierId, name: suppliers.name, purchasedPaisa: sql<string>`coalesce(sum(${purchases.totalPaisa}), 0)`, paidPaisa: sql<string>`coalesce(sum(${purchases.paidPaisa}), 0)`, purchases: sql<number>`count(*)::int` }).from(purchases).innerJoin(suppliers, eq(suppliers.id, purchases.supplierId)).where(where).groupBy(purchases.supplierId, suppliers.name).orderBy(desc(sql`sum(${purchases.totalPaisa})`)).limit(20),
    db.select({ productId: purchaseItems.productId, name: products.name, sku: products.sku, qty: sql<string>`sum(${purchaseItems.qty})`, costPaisa: sql<string>`sum(${purchaseItems.lineTotalPaisa})` }).from(purchaseItems).innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId)).innerJoin(products, eq(products.id, purchaseItems.productId)).where(where).groupBy(purchaseItems.productId, products.name, products.sku).orderBy(desc(sql`sum(${purchaseItems.lineTotalPaisa})`)).limit(10),
  ]);
  const purchasedPaisa = num(kpi?.total);
  const paidPaisa = num(kpi?.paid);
  return {
    kpis: { purchasedPaisa, paidPaisa, outstandingPaisa: Math.max(0, purchasedPaisa - paidPaisa), count: kpi?.n ?? 0 },
    byDay: fillDays(range, byDayRaw.map((r) => ({ day: r.day, purchasedPaisa: num(r.purchasedPaisa), purchases: r.purchases })), { purchasedPaisa: 0, purchases: 0 }),
    bySupplier: bySupplier.map((r) => ({ supplierId: r.supplierId, name: r.name, purchasedPaisa: num(r.purchasedPaisa), paidPaisa: num(r.paidPaisa), purchases: r.purchases })),
    topProducts: topProducts.map((r) => ({ productId: r.productId, name: r.name, sku: r.sku, qty: num(r.qty), costPaisa: num(r.costPaisa) })),
  };
}

export async function purchaseRows(range: DateRange, tz: string) {
  return db
    .select({ number: purchases.number, receivedAt: purchases.receivedAt, supplier: suppliers.name, invoiceRef: purchases.invoiceRef, totalPaisa: purchases.totalPaisa, paidPaisa: purchases.paidPaisa, paymentStatus: purchases.paymentStatus })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(receivedIn(range, tz))
    .orderBy(purchases.receivedAt)
    .limit(20_000);
}
