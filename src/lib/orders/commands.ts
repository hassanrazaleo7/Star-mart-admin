import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import {
  customers,
  discountCodes,
  invoices,
  loyaltyTransactions,
  orderEvents,
  orderItems,
  orders,
  payments,
  products,
  type AdminRole,
  type OrderStatus,
  type PaymentMethod,
} from "@/db/schema";
import { ANCHOR, guarded } from "@/lib/db/guarded";
import { isGuardFailure } from "@/lib/db-errors";
import { evaluateDiscount } from "@/lib/discounts/rules";
import { nextDocumentNumber } from "@/lib/documents";
import { buildEmailInsert } from "@/lib/email/outbox";
import { getSettings, type Settings } from "@/lib/settings";
import { applyStockMovements } from "@/lib/stock/movements";
import { paymentStatusFor, priceCart, settlePayments, type PricedCart } from "./pricing";
import { ORDER_TRANSITIONS, type CartLine, type PaymentInput } from "./types";
import type { OrderLineInput } from "./validation";

export class OrderError extends Error {}

type Actor = { id: string; role: AdminRole };

export type CreateOrderInput = {
  channel: "pos" | "phone" | "walk_in";
  fulfillment: "pickup" | "delivery";
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Guest email (no account): used for the receipt / confirmation email only. */
  customerEmail?: string | null;
  /** Open till shift for POS sales. */
  shiftId?: string | null;
  deliveryAddress?: string | null;
  scheduledFor?: Date | null;
  notes?: string | null;
  lines: OrderLineInput[];
  discountCode: string | null;
  pointsToRedeem: number;
  payments: PaymentInput[];
  /** Managers may override unit prices and give per-line discounts. */
  allowPriceOverride: boolean;
};

export type CreateOrderResult = {
  id: string;
  number: string;
  totalPaisa: number;
  paidPaisa: number;
  changePaisa: number;
  pointsEarned: number;
  invoiceNumber: string | null;
};

const mergeLines = (lines: OrderLineInput[]) => {
  const map = new Map<string, OrderLineInput>();
  for (const l of lines) {
    const prev = map.get(l.productId);
    if (prev && (prev.unitPricePaisa ?? null) === (l.unitPricePaisa ?? null)) map.set(l.productId, { ...prev, qty: prev.qty + l.qty, lineDiscountPaisa: (prev.lineDiscountPaisa ?? 0) + (l.lineDiscountPaisa ?? 0) });
    else map.set(l.productId + (prev ? `:${map.size}` : ""), l);
  }
  return [...map.values()];
};

/** Loads products and builds priced cart lines, applying overrides only when allowed. */
async function buildCart(lines: OrderLineInput[], allowPriceOverride: boolean): Promise<CartLine[]> {
  const merged = mergeLines(lines);
  const ids = [...new Set(merged.map((l) => l.productId))];
  const rows = await db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, allowFractional: products.allowFractional, pricePaisa: products.pricePaisa, costPaisa: products.costPaisa, taxRateBps: products.taxRateBps, stockQty: products.stockQty, status: products.status })
    .from(products)
    .where(inArray(products.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return merged.map((l) => {
    const p = byId.get(l.productId);
    if (!p || p.status !== "active") throw new OrderError("A product in the cart is no longer available.");
    const override = allowPriceOverride && l.unitPricePaisa != null ? l.unitPricePaisa : null;
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      allowFractional: p.allowFractional,
      qty: l.qty,
      unitPricePaisa: override ?? p.pricePaisa,
      listPricePaisa: p.pricePaisa,
      costPaisa: p.costPaisa,
      taxRateBps: p.taxRateBps,
      lineDiscountPaisa: allowPriceOverride ? (l.lineDiscountPaisa ?? 0) : 0,
      stockQty: p.stockQty,
    };
  });
}

async function loadCustomer(customerId: string | null) {
  if (!customerId) return null;
  const row = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.isActive, true)) });
  if (!row) throw new OrderError("The selected customer is not available.");
  return row;
}

/** Guarded, atomic points redemption: fails the batch when the balance is too low. */
function redeemPointsItems(customerId: string, points: number, orderId: string, actorId: string): BatchItem<"pg">[] {
  if (points <= 0) return [];
  return [
    guarded(
      sql`update ${customers} set points_balance = points_balance - ${points}, updated_at = now()
          where ${customers.id} = ${customerId} and points_balance >= ${points} returning ${customers.id}`,
      sql`insert into ${loyaltyTransactions} (customer_id, points_delta, kind, order_id, note, created_by, created_at)
          values (${customerId}, ${-points}, 'redeem', ${orderId}, null, ${actorId}, ${ANCHOR})`,
    ),
  ];
}

function earnPointsItems(customerId: string, points: number, orderId: string, actorId: string): BatchItem<"pg">[] {
  if (points <= 0) return [];
  return [
    db.insert(loyaltyTransactions).values({ customerId, pointsDelta: points, kind: "earn", orderId, createdBy: actorId }),
    db.update(customers).set({ pointsBalance: sql`${customers.pointsBalance} + ${points}`, updatedAt: sql`now()` }).where(eq(customers.id, customerId)),
  ];
}

/** Guarded discount usage: the order row's updated_at anchors the guard so the batch fails if the code is no longer usable. */
function consumeDiscountItems(discountId: string, orderId: string): BatchItem<"pg">[] {
  return [
    guarded(
      sql`update ${discountCodes} set used_count = used_count + 1, updated_at = now()
          where ${discountCodes.id} = ${discountId} and is_active
            and (usage_limit is null or used_count < usage_limit)
            and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
          returning ${discountCodes.id}`,
      sql`update ${orders} set updated_at = ${ANCHOR} where ${orders.id} = ${orderId}`,
    ),
  ];
}

/** Inserts a payment row; credit payments additionally guard the customer's limit. */
function paymentItems(orderId: string, customerId: string | null, p: { method: PaymentMethod; appliedPaisa: number; tenderedPaisa: number; changePaisa: number; reference?: string | null; note?: string | null }, actorId: string): BatchItem<"pg">[] {
  if (p.appliedPaisa <= 0) return [];
  if (p.method === "credit") {
    if (!customerId) throw new OrderError("Credit sales need a customer account.");
    return [
      guarded(
        sql`update ${customers} set credit_balance_paisa = credit_balance_paisa + ${p.appliedPaisa}, updated_at = now()
            where ${customers.id} = ${customerId} and credit_balance_paisa + ${p.appliedPaisa} <= credit_limit_paisa returning ${customers.id}`,
        sql`insert into ${payments} (order_id, method, amount_paisa, received_paisa, change_paisa, reference, note, created_by, created_at)
            values (${orderId}, 'credit', ${p.appliedPaisa}, null, null, ${p.reference ?? null}, ${p.note ?? null}, ${actorId}, ${ANCHOR})`,
      ),
    ];
  }
  return [
    db.insert(payments).values({
      orderId,
      method: p.method,
      amountPaisa: p.appliedPaisa,
      receivedPaisa: p.method === "cash" ? p.tenderedPaisa : null,
      changePaisa: p.method === "cash" ? p.changePaisa : null,
      reference: p.reference ?? null,
      note: p.note ?? null,
      createdBy: actorId,
    }),
  ];
}

function stockItems(orderId: string, cart: PricedCart, settings: Settings, actorId: string, direction: 1 | -1) {
  return applyStockMovements(
    cart.lines.map((l) => ({ productId: l.productId, qtyDelta: direction * -l.qty, kind: direction === 1 ? "sale" : "sale_return", refType: "order", refId: orderId, unitCostPaisa: l.costPaisa, createdBy: actorId })),
    { guardNonNegative: direction === 1 && !settings.stock.allowNegativeStock },
  );
}

function explainGuard(error: unknown, cart: PricedCart, fallback: string): never {
  if (!isGuardFailure(error)) throw error;
  const message = (error as { message?: string })?.message ?? "";
  if (/stock_movements|stock_qty/.test(message)) {
    const short = cart.lines.find((l) => l.stockQty < l.qty);
    throw new OrderError(short ? `Only ${short.stockQty} ${short.unit} of ${short.name} left in stock.` : "Not enough stock for one of the lines.");
  }
  if (/loyalty_transactions/.test(message)) throw new OrderError("The customer no longer has enough points.");
  if (/payments/.test(message)) throw new OrderError("This sale would exceed the customer's credit limit.");
  if (/discount|orders/.test(message)) throw new OrderError("The discount code is no longer valid.");
  throw new OrderError(fallback);
}

export async function createOrder(input: CreateOrderInput, actor: Actor): Promise<CreateOrderResult> {
  const settings = await getSettings();
  const [cartLines, customer] = await Promise.all([buildCart(input.lines, input.allowPriceOverride), loadCustomer(input.customerId)]);
  if (input.pointsToRedeem > 0 && !customer) throw new OrderError("Select a customer to redeem points.");

  let discount = null;
  if (input.discountCode) {
    const row = await db.query.discountCodes.findFirst({ where: eq(discountCodes.code, input.discountCode) });
    const subtotal = cartLines.reduce((s, l) => s + Math.round(l.unitPricePaisa * l.qty) - l.lineDiscountPaisa, 0);
    const check = evaluateDiscount(row, subtotal);
    if (!check.ok) throw new OrderError(check.message);
    discount = check.code;
  }

  const cart = priceCart({ lines: cartLines, discount, pointsToRedeem: input.pointsToRedeem, customer, fulfillment: input.fulfillment, settings });
  if (cart.issues.length) throw new OrderError(cart.issues[0]!);

  const isPos = input.channel === "pos";
  const settled = settlePayments(cart.totalPaisa, input.payments);
  if (settled.applied.some((p) => p.overpaid)) throw new OrderError("Card and bank payments cannot exceed the amount due.");
  if (settled.applied.some((p) => p.method === "credit") && !customer) throw new OrderError("Credit sales need a customer account.");
  if (isPos && settled.remainingPaisa > 0) throw new OrderError(`Payment is short by ${(settled.remainingPaisa / 100).toFixed(2)}.`);
  if (!isPos && cart.totalPaisa > 0 && settled.paidPaisa > cart.totalPaisa) throw new OrderError("Deposit cannot exceed the order total.");

  const number = await nextDocumentNumber("order", settings.numbering.order);
  const invoiceNumber = isPos ? await nextDocumentNumber("invoice", settings.numbering.invoice) : null;
  const orderId = crypto.randomUUID();
  const status: OrderStatus = isPos ? "completed" : "pending";
  const paymentStatus = paymentStatusFor(settled.paidPaisa, cart.totalPaisa);
  const customerEmail = customer?.email ?? input.customerEmail ?? null;
  const customerDisplayName = customer?.name ?? input.customerName ?? null;

  const items: BatchItem<"pg">[] = [
    db.insert(orders).values({
      id: orderId,
      number,
      channel: input.channel,
      fulfillment: input.fulfillment,
      status,
      customerId: customer?.id ?? null,
      shiftId: isPos ? (input.shiftId ?? null) : null,
      customerName: customer?.name ?? input.customerName ?? null,
      customerPhone: customer?.phone ?? input.customerPhone ?? null,
      customerEmail,
      deliveryAddress: input.fulfillment === "delivery" ? (input.deliveryAddress ?? customer?.address ?? null) : null,
      deliveryFeePaisa: cart.deliveryFeePaisa,
      scheduledFor: input.scheduledFor ?? null,
      subtotalPaisa: cart.subtotalPaisa,
      discountPaisa: cart.discountPaisa,
      pointsValuePaisa: cart.pointsValuePaisa,
      taxPaisa: cart.taxPaisa,
      totalPaisa: cart.totalPaisa,
      paidPaisa: settled.paidPaisa,
      discountCodeId: discount?.id ?? null,
      discountCode: discount?.code ?? null,
      pointsRedeemed: cart.pointsRedeemed,
      pointsEarned: cart.pointsEarned,
      paymentStatus,
      notes: input.notes ?? null,
      stockDeductedAt: isPos ? sql`now()` : null,
      completedAt: isPos ? sql`now()` : null,
      createdBy: actor.id,
    }),
    db.insert(orderItems).values(
      cart.lines.map((l, i) => ({
        orderId,
        productId: l.productId,
        position: i,
        name: l.name,
        sku: l.sku,
        unit: l.unit,
        qty: l.qty,
        unitPricePaisa: l.unitPricePaisa,
        costPaisa: l.costPaisa,
        taxRateBps: l.taxRateBps,
        discountPaisa: l.discountPaisa,
        taxPaisa: l.taxPaisa,
        lineTotalPaisa: l.netPaisa,
      })),
    ),
    db.insert(orderEvents).values({ orderId, fromStatus: null, toStatus: status, note: isPos ? "POS sale" : null, actorUserId: actor.id }),
  ];
  if (discount) items.push(...consumeDiscountItems(discount.id, orderId));
  if (customer && cart.pointsRedeemed > 0) items.push(...redeemPointsItems(customer.id, cart.pointsRedeemed, orderId, actor.id));
  for (const p of settled.applied) items.push(...paymentItems(orderId, customer?.id ?? null, p, actor.id));
  if (isPos) {
    items.push(...stockItems(orderId, cart, settings, actor.id, 1));
    if (customer && cart.pointsEarned > 0) items.push(...earnPointsItems(customer.id, cart.pointsEarned, orderId, actor.id));
    items.push(db.insert(invoices).values({ number: invoiceNumber!, orderId, status: "paid", paidAt: sql`now()` }));
    if (customerEmail) items.push(buildEmailInsert({ toEmail: customerEmail, toName: customerDisplayName, subject: `Receipt ${number} from ${settings.store.name}`, template: "invoice", payload: { orderId }, createdBy: actor.id }));
  } else if (customerEmail) {
    items.push(buildEmailInsert({ toEmail: customerEmail, toName: customerDisplayName, subject: `Order ${number} received – ${settings.store.name}`, template: "order_confirmation", payload: { orderId }, createdBy: actor.id }));
  }

  try {
    await db.batch(items as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  } catch (error) {
    explainGuard(error, cart, "The order could not be saved. Please check stock, points and credit and try again.");
  }
  return { id: orderId, number, totalPaisa: cart.totalPaisa, paidPaisa: settled.paidPaisa, changePaisa: settled.changePaisa, pointsEarned: isPos ? cart.pointsEarned : 0, invoiceNumber };
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
async function loadOrder(orderId: string) {
  return db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: { with: { product: { columns: { stockQty: true, unit: true } } } }, payments: true, invoice: true, customer: true } });
}

function cartFromOrder(order: LoadedOrder): PricedCart {
  const lines = order.items.map((i) => ({
    productId: i.productId ?? "",
    name: i.name,
    sku: i.sku,
    unit: i.unit,
    allowFractional: true,
    qty: i.qty,
    unitPricePaisa: i.unitPricePaisa,
    listPricePaisa: i.unitPricePaisa,
    costPaisa: i.costPaisa,
    taxRateBps: i.taxRateBps,
    lineDiscountPaisa: i.discountPaisa,
    stockQty: i.product?.stockQty ?? 0,
    grossPaisa: i.lineTotalPaisa + i.discountPaisa,
    codeDiscountPaisa: 0,
    discountPaisa: i.discountPaisa,
    netPaisa: i.lineTotalPaisa,
    taxPaisa: i.taxPaisa,
  }));
  return { lines, subtotalPaisa: order.subtotalPaisa, manualDiscountPaisa: 0, codeDiscountPaisa: 0, discountPaisa: order.discountPaisa, taxPaisa: order.taxPaisa, deliveryFeePaisa: order.deliveryFeePaisa, pointsRedeemed: order.pointsRedeemed, pointsValuePaisa: order.pointsValuePaisa, totalPaisa: order.totalPaisa, pointsEarned: order.pointsEarned, issues: [] };
}

/** Guarded status change: the event row anchors on the update so a stale transition fails the batch. */
function transitionItems(orderId: string, from: OrderStatus, to: OrderStatus, actorId: string, note: string | null, extraSet = sql``, extraWhere = sql``): BatchItem<"pg"> {
  return guarded(
    sql`update ${orders} set status = ${to}::star_mart.order_status, updated_at = now() ${extraSet}
        where ${orders.id} = ${orderId} and ${orders.status} = ${from}::star_mart.order_status ${extraWhere} returning ${orders.id}`,
    sql`insert into ${orderEvents} (order_id, from_status, to_status, note, actor_user_id, created_at)
        values (${orderId}, ${from}::star_mart.order_status, ${to}::star_mart.order_status, ${note}, ${actorId}, ${ANCHOR})`,
  );
}

export async function transitionOrder(orderId: string, to: OrderStatus, actor: Actor, note: string | null): Promise<{ number: string; from: OrderStatus; invoiceNumber: string | null }> {
  if (to === "cancelled") throw new OrderError("Use cancelOrder to cancel.");
  const order = await loadOrder(orderId);
  if (!order) throw new OrderError("Order not found.");
  const from = order.status;
  if (!ORDER_TRANSITIONS[from].includes(to)) throw new OrderError(`An order that is ${from.replace("_", " ")} cannot be marked ${to.replace("_", " ")}.`);
  if (to === "out_for_delivery" && order.fulfillment !== "delivery") throw new OrderError("Only delivery orders go out for delivery.");
  if (to === "completed" && order.paymentStatus !== "paid") throw new OrderError("Record full payment before completing the order.");

  const settings = await getSettings();
  const cart = cartFromOrder(order);
  const items: BatchItem<"pg">[] = [];
  let invoiceNumber: string | null = order.invoice?.number ?? null;

  if (to === "confirmed") {
    const needsStock = !order.stockDeductedAt;
    items.push(transitionItems(orderId, from, to, actor.id, note, needsStock ? sql`, stock_deducted_at = now()` : sql``));
    if (needsStock) items.push(...stockItems(orderId, cart, settings, actor.id, 1));
    if (!order.invoice) {
      invoiceNumber = await nextDocumentNumber("invoice", settings.numbering.invoice);
      const paid = order.paymentStatus === "paid";
      items.push(db.insert(invoices).values({ number: invoiceNumber, orderId, status: paid ? "paid" : "issued", paidAt: paid ? sql`now()` : null, dueAt: sql`now() + make_interval(days => ${settings.invoice.dueDays})` }));
      if (order.customerEmail) items.push(buildEmailInsert({ toEmail: order.customerEmail, toName: order.customerName, subject: `Invoice ${invoiceNumber} for order ${order.number}`, template: "invoice", payload: { orderId }, createdBy: actor.id }));
    }
  } else if (to === "completed") {
    items.push(transitionItems(orderId, from, to, actor.id, note, sql`, completed_at = now()`, sql`and ${orders.paymentStatus} = 'paid'`));
    if (!order.stockDeductedAt) {
      items.push(db.update(orders).set({ stockDeductedAt: sql`now()` }).where(eq(orders.id, orderId)), ...stockItems(orderId, cart, settings, actor.id, 1));
    }
    if (order.customerId && order.pointsEarned > 0) items.push(...earnPointsItems(order.customerId, order.pointsEarned, orderId, actor.id));
    if (order.invoice) items.push(db.update(invoices).set({ status: "paid", paidAt: sql`coalesce(${invoices.paidAt}, now())` }).where(eq(invoices.orderId, orderId)));
    else {
      invoiceNumber = await nextDocumentNumber("invoice", settings.numbering.invoice);
      items.push(db.insert(invoices).values({ number: invoiceNumber, orderId, status: "paid", paidAt: sql`now()` }));
    }
  } else {
    items.push(transitionItems(orderId, from, to, actor.id, note));
  }

  try {
    await db.batch(items as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  } catch (error) {
    explainGuard(error, cart, "The order was changed by someone else. Reload and try again.");
  }
  return { number: order.number, from, invoiceNumber };
}

export async function cancelOrder(orderId: string, reason: string, refundMethod: PaymentMethod | undefined, actor: Actor): Promise<{ number: string; from: OrderStatus; refundedPaisa: number }> {
  const order = await loadOrder(orderId);
  if (!order) throw new OrderError("Order not found.");
  const from = order.status;
  if (from === "cancelled") throw new OrderError("This order is already cancelled.");
  if (actor.role === "cashier" && from !== "pending") throw new OrderError("Cashiers can only cancel pending orders. Ask a manager.");

  const settings = await getSettings();
  const cart = cartFromOrder(order);
  const livePayments = order.payments.filter((p) => p.amountPaisa > 0);
  const refunds = order.payments.reduce((s, p) => s + (p.amountPaisa < 0 ? -p.amountPaisa : 0), 0);
  const refundable = livePayments.reduce((s, p) => s + p.amountPaisa, 0) - refunds;
  if (refundable > 0 && !refundMethod) throw new OrderError("Choose how the customer is refunded.");

  const items: BatchItem<"pg">[] = [
    transitionItems(orderId, from, "cancelled", actor.id, reason, sql`, cancelled_at = now(), paid_paisa = 0, payment_status = ${refundable > 0 ? "refunded" : "unpaid"}::star_mart.pay_status`),
  ];
  if (order.stockDeductedAt) items.push(...stockItems(orderId, cart, settings, actor.id, -1));
  if (order.customerId) {
    if (order.pointsRedeemed > 0) items.push(db.insert(loyaltyTransactions).values({ customerId: order.customerId, pointsDelta: order.pointsRedeemed, kind: "reverse", orderId, note: "Order cancelled", createdBy: actor.id }), db.update(customers).set({ pointsBalance: sql`${customers.pointsBalance} + ${order.pointsRedeemed}`, updatedAt: sql`now()` }).where(eq(customers.id, order.customerId)));
    if (from === "completed" && order.pointsEarned > 0) {
      items.push(
        guarded(
          sql`update ${customers} set points_balance = points_balance - ${order.pointsEarned}, updated_at = now()
              where ${customers.id} = ${order.customerId} and points_balance >= ${order.pointsEarned} returning ${customers.id}`,
          sql`insert into ${loyaltyTransactions} (customer_id, points_delta, kind, order_id, note, created_by, created_at)
              values (${order.customerId}, ${-order.pointsEarned}, 'reverse', ${orderId}, 'Order cancelled', ${actor.id}, ${ANCHOR})`,
        ),
      );
    }
    const creditUsed = livePayments.filter((p) => p.method === "credit").reduce((s, p) => s + p.amountPaisa, 0);
    if (creditUsed > 0) {
      items.push(
        guarded(
          sql`update ${customers} set credit_balance_paisa = credit_balance_paisa - ${creditUsed}, updated_at = now()
              where ${customers.id} = ${order.customerId} and credit_balance_paisa >= ${creditUsed} returning ${customers.id}`,
          sql`update ${orders} set updated_at = ${ANCHOR} where ${orders.id} = ${orderId}`,
        ),
      );
    }
  }
  if (order.discountCodeId) items.push(db.update(discountCodes).set({ usedCount: sql`greatest(0, ${discountCodes.usedCount} - 1)` }).where(eq(discountCodes.id, order.discountCodeId)));
  if (refundable > 0 && refundMethod) {
    // Credit purchases are reversed on the account above; everything else is refunded by the chosen method.
    const creditPart = livePayments.filter((p) => p.method === "credit").reduce((s, p) => s + p.amountPaisa, 0);
    const cashPart = refundable - creditPart;
    if (creditPart > 0) items.push(db.insert(payments).values({ orderId, method: "credit", amountPaisa: -creditPart, note: "Refund: credit reversed", createdBy: actor.id }));
    if (cashPart > 0) items.push(db.insert(payments).values({ orderId, method: refundMethod === "credit" ? "cash" : refundMethod, amountPaisa: -cashPart, note: `Refund: ${reason}`, createdBy: actor.id }));
  }
  if (order.invoice) items.push(db.update(invoices).set({ status: "void" }).where(eq(invoices.orderId, orderId)));

  try {
    await db.batch(items as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  } catch (error) {
    if (isGuardFailure(error)) {
      const message = (error as { message?: string })?.message ?? "";
      if (/loyalty/.test(message)) throw new OrderError("The customer has already spent the points earned on this order.");
      if (/orders/.test(message)) throw new OrderError("The customer's credit balance no longer covers this order.");
      throw new OrderError("The order was changed by someone else. Reload and try again.");
    }
    throw error;
  }
  return { number: order.number, from, refundedPaisa: refundable };
}

export async function recordPayment(input: { orderId: string; method: PaymentMethod; amountPaisa: number; receivedPaisa?: number | null; reference?: string | null; note?: string | null }, actor: Actor): Promise<{ number: string; changePaisa: number; paidInFull: boolean }> {
  const order = await loadOrder(input.orderId);
  if (!order) throw new OrderError("Order not found.");
  if (order.status === "cancelled") throw new OrderError("Cancelled orders cannot take payments.");
  const due = order.totalPaisa - order.paidPaisa;
  if (due <= 0) throw new OrderError("This order is already paid in full.");
  if (input.amountPaisa > due) throw new OrderError(`Only ${(due / 100).toFixed(2)} is due on this order.`);
  if (input.method === "credit" && !order.customerId) throw new OrderError("Credit requires a customer account.");
  const received = input.method === "cash" ? Math.max(input.receivedPaisa ?? input.amountPaisa, input.amountPaisa) : null;
  const change = received != null ? received - input.amountPaisa : 0;
  const amount = input.amountPaisa;

  const items: BatchItem<"pg">[] = [
    guarded(
      sql`update ${orders} set paid_paisa = paid_paisa + ${amount},
          payment_status = case when paid_paisa + ${amount} >= total_paisa then 'paid'::star_mart.pay_status else 'partial'::star_mart.pay_status end, updated_at = now()
          where ${orders.id} = ${order.id} and ${orders.status} <> 'cancelled' and paid_paisa + ${amount} <= total_paisa returning ${orders.id}`,
      input.method === "credit"
        ? sql`update ${orders} set updated_at = ${ANCHOR} where ${orders.id} = ${order.id}`
        : sql`insert into ${payments} (order_id, method, amount_paisa, received_paisa, change_paisa, reference, note, created_by, created_at)
              values (${order.id}, ${input.method}::star_mart.payment_method, ${amount}, ${received}, ${received != null ? change : null}, ${input.reference ?? null}, ${input.note ?? null}, ${actor.id}, ${ANCHOR})`,
    ),
  ];
  if (input.method === "credit") items.push(...paymentItems(order.id, order.customerId, { method: "credit", appliedPaisa: amount, tenderedPaisa: amount, changePaisa: 0, reference: input.reference, note: input.note }, actor.id));
  items.push(db.update(invoices).set({ status: "paid", paidAt: sql`coalesce(${invoices.paidAt}, now())` }).where(and(eq(invoices.orderId, order.id), sql`${invoices.status} = 'issued' and (select paid_paisa from ${orders} where ${orders}.id = ${order.id}) >= (select total_paisa from ${orders} where ${orders}.id = ${order.id})`)));

  try {
    await db.batch(items as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  } catch (error) {
    if (isGuardFailure(error)) {
      const message = (error as { message?: string })?.message ?? "";
      if (/payments/.test(message)) throw new OrderError("This payment would exceed the customer's credit limit.");
      throw new OrderError("The order changed while recording the payment. Reload and try again.");
    }
    throw error;
  }
  return { number: order.number, changePaisa: change, paidInFull: order.paidPaisa + amount >= order.totalPaisa };
}
