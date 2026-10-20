import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getExpense, listExpenseCategories } from "@/lib/expenses/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { ExpenseForm } from "../../expense-form";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(ROLE_GROUPS.managers);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [expense, categories] = await Promise.all([getExpense(id), listExpenseCategories()]);
  if (!expense) notFound();
  return (
    <div className="grid gap-6">
      <div><h1 className="font-heading text-2xl font-semibold">Edit expense</h1><p className="text-sm text-muted-foreground">{expense.description}</p></div>
      <ExpenseForm expense={expense} categories={categories.filter((c) => c.isActive || c.id === expense.categoryId)} today={expense.incurredAt} />
    </div>
  );
}
