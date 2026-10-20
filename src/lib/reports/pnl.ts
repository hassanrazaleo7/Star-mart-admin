import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories, expenses, orderItems, orders } from "@/db/schema";
import { dayBucket, fillDays, rangeWhere, type DateRange } from "./range";

const num = (v: unknown) => Number(v ?? 0);

/**
 * Profit & loss on completed orders (by completion day) and expenses (by incurred day).
 * Revenue excludes tax; cost of goods uses the cost snapshot on each order line.
 */
export async function pnlReport(range: DateRange, tz: string) {
  const completed = and(eq(orders.status, "completed"), rangeWhere(orders.completedAt, range, tz))!;
  const expWhere = and(isNull(expenses.deletedAt), gte(expenses.incurredAt, range.from), lte(expenses.incurredAt, range.to))!;
  const [[sales], [cogs], [exp], salesByDay, cogsByDay, expByDay, expByCategory] = await Promise.all([
    db.select({ gross: sql<string>`coalesce(sum(${orders.totalPaisa}), 0)`, tax: sql<string>`coalesce(sum(${orders.taxPaisa}), 0)`, delivery: sql<string>`coalesce(sum(${orders.deliveryFeePaisa}), 0)`, discount: sql<string>`coalesce(sum(${orders.discountPaisa}), 0)`, points: sql<string>`coalesce(sum(${orders.pointsValuePaisa}), 0)`, n: sql<number>`count(*)::int` }).from(orders).where(completed),
    db.select({ cogs: sql<string>`coalesce(sum(${orderItems.costPaisa} * ${orderItems.qty}), 0)` }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(completed),
    db.select({ total: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)` }).from(expenses).where(expWhere),
    db.select({ day: dayBucket(orders.completedAt, tz), revenuePaisa: sql<string>`coalesce(sum(${orders.totalPaisa} - ${orders.taxPaisa}), 0)` }).from(orders).where(completed).groupBy(sql`day`),
    db.select({ day: dayBucket(orders.completedAt, tz), cogsPaisa: sql<string>`coalesce(sum(${orderItems.costPaisa} * ${orderItems.qty}), 0)` }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(completed).groupBy(sql`day`),
    db.select({ day: expenses.incurredAt, expensesPaisa: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)` }).from(expenses).where(expWhere).groupBy(expenses.incurredAt),
    db.select({ name: expenseCategories.name, amountPaisa: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)` }).from(expenses).innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId)).where(expWhere).groupBy(expenseCategories.name).orderBy(sql`sum(${expenses.amountPaisa}) desc`),
  ]);
  const grossSalesPaisa = num(sales?.gross);
  const taxPaisa = num(sales?.tax);
  const netRevenuePaisa = grossSalesPaisa - taxPaisa;
  const cogsPaisa = Math.round(num(cogs?.cogs));
  const grossProfitPaisa = netRevenuePaisa - cogsPaisa;
  const expensesPaisa = num(exp?.total);
  const netProfitPaisa = grossProfitPaisa - expensesPaisa;
  const merged = new Map<string, { revenuePaisa: number; cogsPaisa: number; expensesPaisa: number }>();
  const bump = (day: string, patch: Partial<{ revenuePaisa: number; cogsPaisa: number; expensesPaisa: number }>) => merged.set(day, { revenuePaisa: 0, cogsPaisa: 0, expensesPaisa: 0, ...(merged.get(day) ?? {}), ...patch });
  for (const r of salesByDay) bump(r.day, { revenuePaisa: num(r.revenuePaisa) });
  for (const r of cogsByDay) bump(r.day, { cogsPaisa: Math.round(num(r.cogsPaisa)) });
  for (const r of expByDay) bump(r.day, { expensesPaisa: num(r.expensesPaisa) });
  const byDay = fillDays(range, [...merged.entries()].map(([day, v]) => ({ day, ...v })), { revenuePaisa: 0, cogsPaisa: 0, expensesPaisa: 0 }).map((d) => ({ ...d, profitPaisa: d.revenuePaisa - d.cogsPaisa - d.expensesPaisa }));
  return {
    kpis: { grossSalesPaisa, taxPaisa, netRevenuePaisa, cogsPaisa, grossProfitPaisa, grossMarginBps: netRevenuePaisa ? Math.round((grossProfitPaisa / netRevenuePaisa) * 10000) : 0, expensesPaisa, netProfitPaisa, orderCount: sales?.n ?? 0, discountPaisa: num(sales?.discount), pointsValuePaisa: num(sales?.points), deliveryPaisa: num(sales?.delivery) },
    byDay,
    expensesByCategory: expByCategory.map((r) => ({ name: r.name, amountPaisa: num(r.amountPaisa) })),
  };
}
