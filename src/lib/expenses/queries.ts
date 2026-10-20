import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, expenseCategories, expenses } from "@/db/schema";
import type { ExpenseListParams } from "@/lib/validation/expenses";

export const EXPENSES_PAGE_SIZE = 50;

export function expenseFilters(params: Omit<ExpenseListParams, "page">): SQL {
  const filters: SQL[] = [isNull(expenses.deletedAt)];
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(expenses.description, like), ilike(expenses.reference, like))!);
  }
  if (params.category) filters.push(eq(expenses.categoryId, params.category));
  if (params.method) filters.push(eq(expenses.method, params.method));
  if (params.from) filters.push(gte(expenses.incurredAt, params.from));
  if (params.to) filters.push(lte(expenses.incurredAt, params.to));
  return and(...filters)!;
}

export async function listExpenses(params: ExpenseListParams) {
  const where = expenseFilters(params);
  const [rows, [totals]] = await Promise.all([
    db
      .select({ id: expenses.id, description: expenses.description, amountPaisa: expenses.amountPaisa, method: expenses.method, reference: expenses.reference, incurredAt: expenses.incurredAt, receiptUrl: expenses.receiptUrl, categoryName: expenseCategories.name, createdByName: adminUsers.name })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .leftJoin(adminUsers, eq(adminUsers.id, expenses.createdBy))
      .where(where)
      .orderBy(desc(expenses.incurredAt), desc(expenses.createdAt))
      .limit(EXPENSES_PAGE_SIZE)
      .offset((params.page - 1) * EXPENSES_PAGE_SIZE),
    db.select({ n: count(), sum: sql<string>`coalesce(sum(${expenses.amountPaisa}), 0)` }).from(expenses).where(where),
  ]);
  const total = totals?.n ?? 0;
  return { rows, total, sumPaisa: Number(totals?.sum ?? 0), page: params.page, pageCount: Math.max(1, Math.ceil(total / EXPENSES_PAGE_SIZE)) };
}

export async function exportExpenses(params: Omit<ExpenseListParams, "page">) {
  return db
    .select({ incurredAt: expenses.incurredAt, category: expenseCategories.name, description: expenses.description, amountPaisa: expenses.amountPaisa, method: expenses.method, reference: expenses.reference, receiptUrl: expenses.receiptUrl })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(expenseFilters(params))
    .orderBy(asc(expenses.incurredAt))
    .limit(10_000);
}

export async function getExpense(id: string) {
  return db.query.expenses.findFirst({ where: and(eq(expenses.id, id), isNull(expenses.deletedAt)) });
}

export async function listExpenseCategories(activeOnly = false) {
  return db
    .select({ id: expenseCategories.id, name: expenseCategories.name, isActive: expenseCategories.isActive, usage: sql<number>`(select count(*)::int from ${expenses} e where e.category_id = ${expenseCategories}.id and e.deleted_at is null)` })
    .from(expenseCategories)
    .where(activeOnly ? eq(expenseCategories.isActive, true) : undefined)
    .orderBy(asc(expenseCategories.name));
}
