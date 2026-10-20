import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { invoices, orderEvents, orderItems, orders, payments } from "@/db/schema";
import type { OrderListParams } from "./validation";

export const ORDERS_PAGE_SIZE = 25;

export async function listOrders(params: OrderListParams, timeZone = "Asia/Karachi") {
  const filters: SQL[] = [];
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(orders.number, like), ilike(orders.customerName, like), ilike(orders.customerPhone, like))!);
  }
  if (params.status === "open") filters.push(inArray(orders.status, ["pending", "confirmed", "ready", "out_for_delivery"]));
  else if (params.status !== "all") filters.push(eq(orders.status, params.status));
  if (params.fulfillment) filters.push(eq(orders.fulfillment, params.fulfillment));
  if (params.payment) filters.push(eq(orders.paymentStatus, params.payment));
  if (params.channel) filters.push(eq(orders.channel, params.channel));
  if (params.customer) filters.push(eq(orders.customerId, params.customer));
  if (params.from) filters.push(gte(orders.createdAt, sql`(${params.from}::date::timestamp at time zone ${timeZone})`));
  if (params.to) filters.push(lt(orders.createdAt, sql`((${params.to}::date + 1)::timestamp at time zone ${timeZone})`));
  const where = filters.length ? and(...filters) : undefined;
  const [[totals], rows] = await Promise.all([
    db.select({ n: count(), sum: sql<number>`coalesce(sum(${orders.totalPaisa}), 0)::bigint` }).from(orders).where(where),
    db
      .select({ id: orders.id, number: orders.number, channel: orders.channel, fulfillment: orders.fulfillment, status: orders.status, customerId: orders.customerId, customerName: orders.customerName, customerPhone: orders.customerPhone, totalPaisa: orders.totalPaisa, paidPaisa: orders.paidPaisa, paymentStatus: orders.paymentStatus, scheduledFor: orders.scheduledFor, createdAt: orders.createdAt, itemCount: sql<number>`(select count(*)::int from ${orderItems} where ${orderItems}.order_id = ${orders}.id)` })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(ORDERS_PAGE_SIZE)
      .offset((params.page - 1) * ORDERS_PAGE_SIZE),
  ]);
  const total = totals?.n ?? 0;
  return { rows, total, sumPaisa: Number(totals?.sum ?? 0), page: params.page, pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)) };
}

export async function getOrder(id: string) {
  return db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      items: { orderBy: asc(orderItems.position), with: { product: { columns: { id: true, status: true, stockQty: true } } } },
      payments: { orderBy: asc(payments.createdAt), with: { createdBy: { columns: { name: true } } } },
      events: { orderBy: asc(orderEvents.createdAt), with: { actor: { columns: { name: true } } } },
      invoice: true,
      customer: { columns: { id: true, name: true, phone: true, email: true, pointsBalance: true, creditLimitPaisa: true, creditBalancePaisa: true } },
    },
  });
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

export async function getInvoiceByOrder(orderId: string) {
  return db.query.invoices.findFirst({ where: eq(invoices.orderId, orderId) });
}

export async function countOpenOrders(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(orders).where(inArray(orders.status, ["pending", "confirmed", "ready", "out_for_delivery"]));
  return row?.n ?? 0;
}
