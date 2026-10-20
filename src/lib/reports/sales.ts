import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, payments } from "@/db/schema";
import { dayBucket, fillDays, rangeWhere, type DateRange } from "./range";

const completedIn = (range: DateRange, tz: string) => and(eq(orders.status, "completed"), rangeWhere(orders.completedAt, range, tz))!;
const num = (v: unknown) => Number(v ?? 0);

export async function salesReport(range: DateRange, tz: string) {
  const where = completedIn(range, tz);
  const [[kpi], byDayRaw, byChannel, byMethod, topProducts] = await Promise.all([
    db.select({ revenue: sql<string>`coalesce(sum(${orders.totalPaisa}), 0)`, n: sql<number>`count(*)::int`, tax: sql<string>`coalesce(sum(${orders.taxPaisa}), 0)`, discount: sql<string>`coalesce(sum(${orders.discountPaisa}), 0)`, points: sql<string>`coalesce(sum(${orders.pointsValuePaisa}), 0)`, delivery: sql<string>`coalesce(sum(${orders.deliveryFeePaisa}), 0)`, items: sql<string>`coalesce((select sum(oi.qty) from ${orderItems} oi join ${orders} o2 on o2.id = oi.order_id where o2.status = 'completed' and ${rangeWhere(sql`o2.completed_at`, range, tz)}), 0)` }).from(orders).where(where),
    db.select({ day: dayBucket(orders.completedAt, tz), revenuePaisa: sql<string>`coalesce(sum(${orders.totalPaisa}), 0)`, orders: sql<number>`count(*)::int` }).from(orders).where(where).groupBy(sql`day`).orderBy(sql`day`),
    db.select({ channel: orders.channel, revenuePaisa: sql<string>`coalesce(sum(${orders.totalPaisa}), 0)`, orders: sql<number>`count(*)::int` }).from(orders).where(where).groupBy(orders.channel),
    db.select({ method: payments.method, amountPaisa: sql<string>`coalesce(sum(${payments.amountPaisa}), 0)` }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(and(where, gt(payments.amountPaisa, 0))).groupBy(payments.method),
    db.select({ productId: orderItems.productId, name: orderItems.name, sku: orderItems.sku, qty: sql<string>`sum(${orderItems.qty})`, revenuePaisa: sql<string>`sum(${orderItems.lineTotalPaisa})`, profitPaisa: sql<string>`sum(${orderItems.lineTotalPaisa} - ${orderItems.taxPaisa} - ${orderItems.costPaisa} * ${orderItems.qty})` }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(where).groupBy(orderItems.productId, orderItems.name, orderItems.sku).orderBy(desc(sql`sum(${orderItems.lineTotalPaisa})`)).limit(10),
  ]);
  const revenuePaisa = num(kpi?.revenue);
  const orderCount = kpi?.n ?? 0;
  return {
    kpis: { revenuePaisa, orderCount, avgOrderPaisa: orderCount ? Math.round(revenuePaisa / orderCount) : 0, taxPaisa: num(kpi?.tax), discountPaisa: num(kpi?.discount), pointsValuePaisa: num(kpi?.points), deliveryPaisa: num(kpi?.delivery), itemsSold: num(kpi?.items) },
    byDay: fillDays(range, byDayRaw.map((r) => ({ day: r.day, revenuePaisa: num(r.revenuePaisa), orders: r.orders })), { revenuePaisa: 0, orders: 0 }),
    byChannel: byChannel.map((r) => ({ channel: r.channel, revenuePaisa: num(r.revenuePaisa), orders: r.orders })),
    byMethod: byMethod.map((r) => ({ method: r.method, amountPaisa: num(r.amountPaisa) })),
    topProducts: topProducts.map((r) => ({ productId: r.productId, name: r.name, sku: r.sku, qty: num(r.qty), revenuePaisa: num(r.revenuePaisa), profitPaisa: num(r.profitPaisa) })),
  };
}

/** Order-level rows for the CSV export. */
export async function salesRows(range: DateRange, tz: string) {
  const rows = await db
    .select({ number: orders.number, completedAt: orders.completedAt, channel: orders.channel, fulfillment: orders.fulfillment, customer: orders.customerName, subtotalPaisa: orders.subtotalPaisa, discountPaisa: orders.discountPaisa, pointsValuePaisa: orders.pointsValuePaisa, deliveryFeePaisa: orders.deliveryFeePaisa, taxPaisa: orders.taxPaisa, totalPaisa: orders.totalPaisa, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(completedIn(range, tz))
    .orderBy(orders.completedAt)
    .limit(20_000);
  return rows;
}
