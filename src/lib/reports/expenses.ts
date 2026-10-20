import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { fillDays, type DateRange } from "./range";

const num = (v: unknown) => Number(v ?? 0);
export const expensesIn = (range: DateRange) => and(isNull(expenses.deletedAt), gte(expenses.incurredAt, range.from), lte(expenses.incurredAt, range.to))!;

export async function expensesReport(range: DateRange) {
  const where = expensesIn(range);
  const [[kpi], byCategory, byMethod, byDayRaw] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)`, n: sql<number>`count(*)::int` }).from(expenses).where(where),
    db.select({ categoryId: expenses.categoryId, name: expenseCategories.name, amountPaisa: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)`, n: sql<number>`count(*)::int` }).from(expenses).innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId)).where(where).groupBy(expenses.categoryId, expenseCategories.name).orderBy(desc(sql`sum(${expenses.amountPaisa})`)),
    db.select({ method: expenses.method, amountPaisa: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)` }).from(expenses).where(where).groupBy(expenses.method),
    db.select({ day: expenses.incurredAt, amountPaisa: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)` }).from(expenses).where(where).groupBy(expenses.incurredAt).orderBy(expenses.incurredAt),
  ]);
  return {
    kpis: { totalPaisa: num(kpi?.total), count: kpi?.n ?? 0, avgPerDayPaisa: Math.round(num(kpi?.total) / Math.max(1, range.days)) },
    byCategory: byCategory.map((r) => ({ categoryId: r.categoryId, name: r.name, amountPaisa: num(r.amountPaisa), count: r.n })),
    byMethod: byMethod.map((r) => ({ method: r.method, amountPaisa: num(r.amountPaisa) })),
    byDay: fillDays(range, byDayRaw.map((r) => ({ day: r.day, amountPaisa: num(r.amountPaisa) })), { amountPaisa: 0 }),
  };
}
