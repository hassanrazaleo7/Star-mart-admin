"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db-errors";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstIssue, uuidSchema } from "@/lib/validation/common";
import { expenseCategorySchema, expenseSchema } from "@/lib/validation/expenses";

export type ExpenseFormState = { error: string | null };

export async function saveExpenseAction(_previous: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = expenseSchema.safeParse(Object.fromEntries(["id", "categoryId", "description", "amountPaisa", "method", "reference", "incurredAt", "receiptUrl"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...values } = parsed.data;
  const meta = await getRequestMeta();
  if (id) {
    const rows = await db.update(expenses).set({ ...values, updatedAt: sql`now()` }).where(eq(expenses.id, id)).returning({ id: expenses.id });
    if (!rows.length) return { error: "Expense not found." };
    await audit("expense.updated", { ...meta, actorUserId: ctx.user.id, metadata: { expenseId: id, amountPaisa: values.amountPaisa } });
  } else {
    const [row] = await db.insert(expenses).values({ ...values, createdBy: ctx.user.id }).returning({ id: expenses.id });
    await audit("expense.created", { ...meta, actorUserId: ctx.user.id, metadata: { expenseId: row?.id, amountPaisa: values.amountPaisa, categoryId: values.categoryId } });
  }
  revalidatePath("/expenses");
  revalidatePath("/reports");
  redirect(`/expenses?msg=${id ? "expense_updated" : "expense_created"}`);
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("expenseId"));
  if (!id.success) redirect("/expenses");
  await db.update(expenses).set({ deletedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(expenses.id, id.data));
  const meta = await getRequestMeta();
  await audit("expense.deleted", { ...meta, actorUserId: ctx.user.id, metadata: { expenseId: id.data } });
  revalidatePath("/expenses");
  revalidatePath("/reports");
  redirect("/expenses?msg=expense_deleted");
}

export type CategoryFormState = { error: string | null; ok?: boolean };

export async function saveExpenseCategoryAction(_previous: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = expenseCategorySchema.safeParse({ id: formData.get("id"), name: formData.get("name") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const meta = await getRequestMeta();
  try {
    if (parsed.data.id) {
      await db.update(expenseCategories).set({ name: parsed.data.name }).where(eq(expenseCategories.id, parsed.data.id));
      await audit("expense_category.updated", { ...meta, actorUserId: ctx.user.id, metadata: { categoryId: parsed.data.id, name: parsed.data.name } });
    } else {
      const [row] = await db.insert(expenseCategories).values({ name: parsed.data.name }).returning({ id: expenseCategories.id });
      await audit("expense_category.created", { ...meta, actorUserId: ctx.user.id, metadata: { categoryId: row?.id, name: parsed.data.name } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "A category with that name already exists." };
    throw error;
  }
  revalidatePath("/expenses");
  return { error: null, ok: true };
}

export async function setExpenseCategoryActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("categoryId"));
  if (!id.success) redirect("/expenses");
  const active = formData.get("active") === "true";
  await db.update(expenseCategories).set({ isActive: active }).where(eq(expenseCategories.id, id.data));
  const meta = await getRequestMeta();
  await audit("expense_category.updated", { ...meta, actorUserId: ctx.user.id, metadata: { categoryId: id.data, isActive: active } });
  revalidatePath("/expenses");
  redirect("/expenses?msg=expense_category_saved");
}
