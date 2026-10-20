import { and, asc, count, desc, eq, gt, ilike, lt, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, orderItems, orders, payments, posShifts, type PaymentMethod } from "@/db/schema";
import { parseRange, rangeWhere, type DateRange } from "@/lib/reports/range";
import type { ShiftListParams } from "@/lib/validation/shifts";

export const SHIFTS_PAGE_SIZE = 25;
const num = (v: unknown) => Number(v ?? 0);

export type ShiftSummary = {
  salesCount: number;
  cancelledCount: number;
  itemsSold: number;
  grossPaisa: number;
  discountPaisa: number;
  pointsValuePaisa: number;
  taxPaisa: number;
  byMethod: Record<PaymentMethod, { receivedPaisa: number; refundedPaisa: number }>;
  cashInPaisa: number;
  cashOutPaisa: number;
  expectedCashPaisa: number;
};

/** Totals for one shift from its orders and payments (cash expected = float + cash in − cash refunds). */
export async function shiftSummary(shiftId: string, openingFloatPaisa: number): Promise<ShiftSummary> {
  const [[o], methods, [items]] = await Promise.all([
    db
      .select({
        sales: sql<number>`count(*) filter (where ${orders.status} <> 'cancelled')::int`,
        cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
        gross: sql<string>`coalesce(sum(${orders.totalPaisa}) filter (where ${orders.status} <> 'cancelled'), 0)`,
        discount: sql<string>`coalesce(sum(${orders.discountPaisa}) filter (where ${orders.status} <> 'cancelled'), 0)`,
        points: sql<string>`coalesce(sum(${orders.pointsValuePaisa}) filter (where ${orders.status} <> 'cancelled'), 0)`,
        tax: sql<string>`coalesce(sum(${orders.taxPaisa}) filter (where ${orders.status} <> 'cancelled'), 0)`,
      })
      .from(orders)
      .where(eq(orders.shiftId, shiftId)),
    db
      .select({ method: payments.method, received: sql<string>`coalesce(sum(${payments.amountPaisa}) filter (where ${payments.amountPaisa} > 0), 0)`, refunded: sql<string>`coalesce(-sum(${payments.amountPaisa}) filter (where ${payments.amountPaisa} < 0), 0)` })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(eq(orders.shiftId, shiftId))
      .groupBy(payments.method),
    db
      .select({ qty: sql<string>`coalesce(sum(${orderItems.qty}), 0)` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.shiftId, shiftId), ne(orders.status, "cancelled"))),
  ]);
  const byMethod: ShiftSummary["byMethod"] = { cash: { receivedPaisa: 0, refundedPaisa: 0 }, card: { receivedPaisa: 0, refundedPaisa: 0 }, bank_transfer: { receivedPaisa: 0, refundedPaisa: 0 }, credit: { receivedPaisa: 0, refundedPaisa: 0 } };
  for (const m of methods) byMethod[m.method] = { receivedPaisa: num(m.received), refundedPaisa: num(m.refunded) };
  const cashInPaisa = byMethod.cash.receivedPaisa;
  const cashOutPaisa = byMethod.cash.refundedPaisa;
  return {
    salesCount: o?.sales ?? 0,
    cancelledCount: o?.cancelled ?? 0,
    itemsSold: num(items?.qty),
    grossPaisa: num(o?.gross),
    discountPaisa: num(o?.discount),
    pointsValuePaisa: num(o?.points),
    taxPaisa: num(o?.tax),
    byMethod,
    cashInPaisa,
    cashOutPaisa,
    expectedCashPaisa: openingFloatPaisa + cashInPaisa - cashOutPaisa,
  };
}

export async function currentShiftFor(userId: string) {
  return db.query.posShifts.findFirst({ where: and(eq(posShifts.cashierUserId, userId), eq(posShifts.status, "open")) });
}

export async function getShift(id: string) {
  return db.query.posShifts.findFirst({
    where: eq(posShifts.id, id),
    with: {
      cashier: { columns: { id: true, name: true, email: true } },
      closer: { columns: { name: true } },
      reopener: { columns: { name: true } },
      orders: { orderBy: desc(orders.createdAt), columns: { id: true, number: true, status: true, customerName: true, totalPaisa: true, paidPaisa: true, paymentStatus: true, createdAt: true } },
    },
  });
}
export type ShiftDetail = NonNullable<Awaited<ReturnType<typeof getShift>>>;

const methodTotal = (method: PaymentMethod) => sql<string>`coalesce((select sum(p.amount_paisa) from ${payments} p join ${orders} o on o.id = p.order_id where o.shift_id = ${posShifts}.id and p.method = ${method}), 0)`;

export function shiftFilters(params: Omit<ShiftListParams, "page">, tz: string, forceCashier?: string): { where: SQL; range: DateRange } {
  const range = parseRange({ range: params.range ?? "30d", from: params.from, to: params.to }, tz);
  const filters: SQL[] = [rangeWhere(posShifts.openedAt, range, tz)];
  const cashier = forceCashier ?? params.cashier;
  if (cashier) filters.push(eq(posShifts.cashierUserId, cashier));
  if (params.status !== "all") filters.push(eq(posShifts.status, params.status));
  if (params.variance === "nonzero") filters.push(sql`coalesce(${posShifts.variancePaisa}, 0) <> 0`);
  else if (params.variance === "short") filters.push(lt(posShifts.variancePaisa, 0));
  else if (params.variance === "over") filters.push(gt(posShifts.variancePaisa, 0));
  if (params.q) filters.push(ilike(posShifts.number, `%${params.q.replace(/[%_]/g, "\\$&")}%`));
  return { where: and(...filters)!, range };
}

export async function listShifts(params: ShiftListParams, tz: string, forceCashier?: string) {
  const { where, range } = shiftFilters(params, tz, forceCashier);
  const selection = {
    id: posShifts.id,
    number: posShifts.number,
    status: posShifts.status,
    cashierId: posShifts.cashierUserId,
    cashierName: adminUsers.name,
    openedAt: posShifts.openedAt,
    closedAt: posShifts.closedAt,
    openingFloatPaisa: posShifts.openingFloatPaisa,
    expectedCashPaisa: posShifts.expectedCashPaisa,
    countedCashPaisa: posShifts.countedCashPaisa,
    variancePaisa: posShifts.variancePaisa,
    reopenedAt: posShifts.reopenedAt,
    sales: sql<number>`(select count(*)::int from ${orders} o where o.shift_id = ${posShifts}.id and o.status <> 'cancelled')`,
    salesPaisa: sql<string>`coalesce((select sum(o.total_paisa) from ${orders} o where o.shift_id = ${posShifts}.id and o.status <> 'cancelled'), 0)`,
    cashPaisa: methodTotal("cash"),
    cardPaisa: methodTotal("card"),
    bankPaisa: methodTotal("bank_transfer"),
    creditPaisa: methodTotal("credit"),
  };
  const [rows, [{ total }], [sums]] = await Promise.all([
    db.select(selection).from(posShifts).innerJoin(adminUsers, eq(adminUsers.id, posShifts.cashierUserId)).where(where).orderBy(desc(posShifts.openedAt)).limit(SHIFTS_PAGE_SIZE).offset((params.page - 1) * SHIFTS_PAGE_SIZE),
    db.select({ total: count() }).from(posShifts).where(where),
    db
      .select({
        shifts: sql<number>`count(*)::int`,
        sales: sql<string>`coalesce(sum((select sum(o.total_paisa) from ${orders} o where o.shift_id = ${posShifts}.id and o.status <> 'cancelled')), 0)`,
        cash: sql<string>`coalesce(sum(${methodTotal("cash")}), 0)`,
        card: sql<string>`coalesce(sum(${methodTotal("card")}), 0)`,
        bank: sql<string>`coalesce(sum(${methodTotal("bank_transfer")}), 0)`,
        credit: sql<string>`coalesce(sum(${methodTotal("credit")}), 0)`,
        variance: sql<string>`coalesce(sum(${posShifts.variancePaisa}), 0)`,
      })
      .from(posShifts)
      .where(where),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, salesPaisa: num(r.salesPaisa), cashPaisa: num(r.cashPaisa), cardPaisa: num(r.cardPaisa), bankPaisa: num(r.bankPaisa), creditPaisa: num(r.creditPaisa) })),
    total: Number(total),
    page: params.page,
    pageCount: Math.max(1, Math.ceil(Number(total) / SHIFTS_PAGE_SIZE)),
    range,
    totals: { shifts: sums?.shifts ?? 0, salesPaisa: num(sums?.sales), cashPaisa: num(sums?.cash), cardPaisa: num(sums?.card), bankPaisa: num(sums?.bank), creditPaisa: num(sums?.credit), variancePaisa: num(sums?.variance) },
  };
}

export async function listCashiers() {
  return db.select({ id: adminUsers.id, name: adminUsers.name }).from(adminUsers).where(and(eq(adminUsers.isActive, true), ne(adminUsers.role, "vendor"))).orderBy(asc(adminUsers.name));
}

export async function countOpenShifts(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(posShifts).where(eq(posShifts.status, "open"));
  return row?.n ?? 0;
}
