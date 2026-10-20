"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { customerCreditPayments, customers, loyaltyTransactions } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { searchCustomers, type CustomerLite } from "@/lib/customers/queries";
import { ANCHOR, guarded } from "@/lib/db/guarded";
import { isGuardFailure, isUniqueViolation } from "@/lib/db-errors";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { firstIssue, uuidSchema } from "@/lib/validation/common";
import { adjustPointsSchema, creditPaymentSchema, customerSchema } from "@/lib/validation/customers";

export type CustomerFormState = { error: string | null; created?: CustomerLite };

export async function saveCustomerAction(_previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = customerSchema.safeParse(Object.fromEntries(["id", "name", "phone", "email", "address", "type", "creditLimitPaisa", "notes"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, creditLimitPaisa, ...values } = parsed.data;
  const meta = await getRequestMeta();
  try {
    if (id) {
      // Cashiers may edit contact details but not the credit limit.
      await db
        .update(customers)
        .set({ ...values, ...(isManager(ctx.user.role) ? { creditLimitPaisa } : {}), updatedAt: sql`now()` })
        .where(eq(customers.id, id));
      await audit("customer.updated", { ...meta, actorUserId: ctx.user.id, metadata: { customerId: id } });
      revalidatePath(`/customers/${id}`);
      revalidatePath("/customers");
      return { error: null };
    }
    const [row] = await db
      .insert(customers)
      .values({ ...values, creditLimitPaisa: isManager(ctx.user.role) ? creditLimitPaisa : 0, createdBy: ctx.user.id })
      .returning({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, type: customers.type, pointsBalance: customers.pointsBalance, creditLimitPaisa: customers.creditLimitPaisa, creditBalancePaisa: customers.creditBalancePaisa, address: customers.address });
    await audit("customer.created", { ...meta, actorUserId: ctx.user.id, metadata: { customerId: row?.id, name: values.name } });
    revalidatePath("/customers");
    return { error: null, created: row };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "A customer with that phone number already exists." };
    throw error;
  }
}

export async function setCustomerActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("customerId"));
  if (!id.success) redirect("/customers");
  const active = formData.get("active") === "true";
  await db.update(customers).set({ isActive: active, updatedAt: sql`now()` }).where(eq(customers.id, id.data));
  const meta = await getRequestMeta();
  await audit(active ? "customer.enabled" : "customer.disabled", { ...meta, actorUserId: ctx.user.id, metadata: { customerId: id.data } });
  revalidatePath("/customers");
  redirect(`/customers/${id.data}?status=${active ? "customer_enabled" : "customer_disabled"}`);
}

export type LedgerFormState = { error: string | null; ok?: boolean };

export async function adjustPointsAction(_previous: LedgerFormState, formData: FormData): Promise<LedgerFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = adjustPointsSchema.safeParse({ customerId: formData.get("customerId"), pointsDelta: formData.get("pointsDelta"), note: formData.get("note") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { customerId, pointsDelta, note } = parsed.data;
  const meta = await getRequestMeta();
  try {
    await db.batch([
      guarded(
        sql`update ${customers} set points_balance = points_balance + ${pointsDelta}, updated_at = now()
            where ${customers.id} = ${customerId} and points_balance + ${pointsDelta} >= 0 returning ${customers.id}`,
        sql`insert into ${loyaltyTransactions} (customer_id, points_delta, kind, note, created_by, created_at)
            values (${customerId}, ${pointsDelta}, 'adjust', ${note}, ${ctx.user.id}, ${ANCHOR})`,
      ),
    ]);
  } catch (error) {
    if (isGuardFailure(error)) return { error: "The customer does not have enough points for that deduction." };
    throw error;
  }
  await audit("loyalty.adjusted", { ...meta, actorUserId: ctx.user.id, metadata: { customerId, pointsDelta, note } });
  revalidatePath(`/customers/${customerId}`);
  return { error: null, ok: true };
}

export async function recordCreditPaymentAction(_previous: LedgerFormState, formData: FormData): Promise<LedgerFormState> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = creditPaymentSchema.safeParse({ customerId: formData.get("customerId"), amountPaisa: formData.get("amount"), method: formData.get("method"), reference: formData.get("reference"), note: formData.get("note") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const meta = await getRequestMeta();
  try {
    await db.batch([
      guarded(
        sql`update ${customers} set credit_balance_paisa = credit_balance_paisa - ${d.amountPaisa}, updated_at = now()
            where ${customers.id} = ${d.customerId} and credit_balance_paisa - ${d.amountPaisa} >= 0 returning ${customers.id}`,
        sql`insert into ${customerCreditPayments} (customer_id, amount_paisa, method, reference, note, created_by, created_at)
            values (${d.customerId}, ${d.amountPaisa}, ${d.method}, ${d.reference}, ${d.note}, ${ctx.user.id}, ${ANCHOR})`,
      ),
    ]);
  } catch (error) {
    if (isGuardFailure(error)) return { error: "The payment exceeds the customer's outstanding credit balance." };
    throw error;
  }
  await audit("credit.payment_recorded", { ...meta, actorUserId: ctx.user.id, metadata: { customerId: d.customerId, amountPaisa: d.amountPaisa, method: d.method } });
  revalidatePath(`/customers/${d.customerId}`);
  revalidatePath("/customers");
  return { error: null, ok: true };
}

export async function searchCustomersAction(query: string): Promise<CustomerLite[]> {
  await requireRole(ROLE_GROUPS.staff);
  return searchCustomers(query);
}
