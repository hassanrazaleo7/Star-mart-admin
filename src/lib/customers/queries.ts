import { discountCodes as discountCodesTable } from "@/db/schema";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customerCreditPayments, customers, loyaltyTransactions, orders, payments } from "@/db/schema";

export const CUSTOMERS_PAGE_SIZE = 25;

export async function listCustomers(params: { q?: string; type?: string; active?: string; page?: number }) {
  const filters: SQL[] = [];
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(customers.name, like), ilike(customers.phone, like), ilike(customers.email, like))!);
  }
  if (params.type === "retail" || params.type === "wholesale") filters.push(eq(customers.type, params.type));
  if (params.active === "inactive") filters.push(eq(customers.isActive, false));
  else if (params.active !== "all") filters.push(eq(customers.isActive, true));
  const where = filters.length ? and(...filters) : undefined;
  const page = params.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        type: customers.type,
        pointsBalance: customers.pointsBalance,
        creditLimitPaisa: customers.creditLimitPaisa,
        creditBalancePaisa: customers.creditBalancePaisa,
        isActive: customers.isActive,
        orderCount: sql<number>`(select count(*)::int from ${orders} o where o.customer_id = ${customers}.id and o.status <> 'cancelled')`,
        lastOrderAt: sql<Date | null>`(select max(o.created_at) from ${orders} o where o.customer_id = ${customers}.id)`,
      })
      .from(customers)
      .where(where)
      .orderBy(asc(customers.name))
      .limit(CUSTOMERS_PAGE_SIZE)
      .offset((page - 1) * CUSTOMERS_PAGE_SIZE),
    db.select({ total: count() }).from(customers).where(where),
  ]);
  return { rows, total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / CUSTOMERS_PAGE_SIZE)) };
}

export async function getCustomer(id: string) {
  return db.query.customers.findFirst({ where: eq(customers.id, id) });
}

export type CustomerLite = { id: string; name: string; phone: string | null; email: string | null; type: "retail" | "wholesale"; pointsBalance: number; creditLimitPaisa: number; creditBalancePaisa: number; address: string | null };

export async function searchCustomers(query: string, limit = 10): Promise<CustomerLite[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  return db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, type: customers.type, pointsBalance: customers.pointsBalance, creditLimitPaisa: customers.creditLimitPaisa, creditBalancePaisa: customers.creditBalancePaisa, address: customers.address })
    .from(customers)
    .where(and(eq(customers.isActive, true), or(ilike(customers.name, like), ilike(customers.phone, like), ilike(customers.email, like))))
    .orderBy(asc(customers.name))
    .limit(limit);
}

export async function customerOrders(customerId: string, limit = 50) {
  return db
    .select({ id: orders.id, number: orders.number, channel: orders.channel, fulfillment: orders.fulfillment, status: orders.status, totalPaisa: orders.totalPaisa, paidPaisa: orders.paidPaisa, paymentStatus: orders.paymentStatus, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function customerPointsLedger(customerId: string, limit = 100) {
  return db
    .select({ id: loyaltyTransactions.id, createdAt: loyaltyTransactions.createdAt, pointsDelta: loyaltyTransactions.pointsDelta, kind: loyaltyTransactions.kind, note: loyaltyTransactions.note, orderId: loyaltyTransactions.orderId, orderNumber: orders.number })
    .from(loyaltyTransactions)
    .leftJoin(orders, eq(orders.id, loyaltyTransactions.orderId))
    .where(eq(loyaltyTransactions.customerId, customerId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(limit);
}

export type CreditLedgerRow = { date: Date; kind: "sale" | "payment" | "refund"; ref: string; orderId: string | null; debitPaisa: number; creditPaisa: number; note: string | null };

/** Credit sales (what the customer owes) versus payments received, newest first. */
export async function customerCreditLedger(customerId: string): Promise<CreditLedgerRow[]> {
  const [sales, received] = await Promise.all([
    db
      .select({ date: payments.createdAt, amount: payments.amountPaisa, orderId: payments.orderId, orderNumber: orders.number })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(and(eq(orders.customerId, customerId), eq(payments.method, "credit"))),
    db
      .select({ date: customerCreditPayments.createdAt, amount: customerCreditPayments.amountPaisa, method: customerCreditPayments.method, reference: customerCreditPayments.reference, note: customerCreditPayments.note })
      .from(customerCreditPayments)
      .where(eq(customerCreditPayments.customerId, customerId)),
  ]);
  const rows: CreditLedgerRow[] = [
    ...sales.map((s) => ({ date: s.date, kind: s.amount >= 0 ? ("sale" as const) : ("refund" as const), ref: s.orderNumber, orderId: s.orderId, debitPaisa: Math.max(0, s.amount), creditPaisa: Math.max(0, -s.amount), note: null })),
    ...received.map((r) => ({ date: r.date, kind: "payment" as const, ref: `${r.method.replace("_", " ")}${r.reference ? ` · ${r.reference}` : ""}`, orderId: null, debitPaisa: 0, creditPaisa: r.amount, note: r.note })),
  ];
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function listDiscountCodes() {
  const codes = await db.select().from(discountCodesTable).orderBy(desc(discountCodesTable.createdAt));
  return { codes, now: Date.now() };
}

