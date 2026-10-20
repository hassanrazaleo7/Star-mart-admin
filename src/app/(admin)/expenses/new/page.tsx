import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { listExpenseCategories } from "@/lib/expenses/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage() {
  await requireRole(ROLE_GROUPS.managers);
  const [categories, settings] = await Promise.all([listExpenseCategories(true), getSettings()]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.store.timezone }).format(new Date());
  return (
    <div className="grid gap-6">
      <div><h1 className="font-heading text-2xl font-semibold">Add expense</h1><p className="text-sm text-muted-foreground">Operating costs that reduce profit in the P&amp;L report.</p></div>
      <ExpenseForm categories={categories} today={today} />
    </div>
  );
}
