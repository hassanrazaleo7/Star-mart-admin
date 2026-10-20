"use server";

import { scheduleEmailWork } from "@/lib/email/schedule";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { enqueueEmail } from "@/lib/email/outbox";
import { cancelOrder, createOrder, OrderError, recordPayment, transitionOrder } from "@/lib/orders/commands";
import { getOrder } from "@/lib/orders/queries";
import { cancelOrderSchema, createOrderSchema, recordPaymentSchema, transitionOrderSchema } from "@/lib/orders/validation";
import { findProductByBarcode, searchProducts, type ProductSearchRow } from "@/lib/products/queries";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstIssue, uuidSchema } from "@/lib/validation/common";

export type OrderFormState = { error: string | null };

const revalidateOrder = (id: string) => {
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  revalidatePath("/stock");
  revalidatePath("/customers");
};

export async function createOrderAction(_previous: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = createOrderSchema.safeParse(
    Object.fromEntries(["channel", "fulfillment", "customerId", "customerName", "customerPhone", "deliveryAddress", "scheduledFor", "notes", "discountCode", "pointsToRedeem", "lines", "depositMethod", "depositAmount", "depositReference"].map((k) => [k, formData.get(k)])),
  );
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const meta = await getRequestMeta();
  let result;
  try {
    result = await createOrder(
      {
        channel: d.channel,
        fulfillment: d.fulfillment,
        customerId: d.customerId ?? null,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        deliveryAddress: d.deliveryAddress,
        scheduledFor: d.scheduledFor,
        notes: d.notes,
        lines: d.lines,
        discountCode: d.discountCode,
        pointsToRedeem: d.pointsToRedeem,
        payments: d.depositAmount && d.depositMethod ? [{ method: d.depositMethod, amountPaisa: d.depositAmount, reference: d.depositReference }] : [],
        allowPriceOverride: isManager(ctx.user.role),
      },
      { id: ctx.user.id, role: ctx.user.role },
    );
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    throw error;
  }
  await audit("order.created", { ...meta, actorUserId: ctx.user.id, metadata: { orderId: result.id, number: result.number, channel: d.channel, totalPaisa: result.totalPaisa, paidPaisa: result.paidPaisa } });
  revalidateOrder(result.id);
  scheduleEmailWork();
  redirect(`/orders/${result.id}?status=order_created`);
}

export async function transitionOrderAction(_previous: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = transitionOrderSchema.safeParse({ orderId: formData.get("orderId"), to: formData.get("to"), note: formData.get("note") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const meta = await getRequestMeta();
  let result;
  try {
    result = await transitionOrder(parsed.data.orderId, parsed.data.to, { id: ctx.user.id, role: ctx.user.role }, parsed.data.note);
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    throw error;
  }
  await audit("order.status_changed", { ...meta, actorUserId: ctx.user.id, metadata: { orderId: parsed.data.orderId, number: result.number, from: result.from, to: parsed.data.to, invoiceNumber: result.invoiceNumber } });
  revalidateOrder(parsed.data.orderId);
  scheduleEmailWork({ lowStock: parsed.data.to === "confirmed" || parsed.data.to === "completed" });
  redirect(`/orders/${parsed.data.orderId}?status=order_${parsed.data.to}`);
}

export async function cancelOrderAction(_previous: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = cancelOrderSchema.safeParse({ orderId: formData.get("orderId"), reason: formData.get("reason"), refundMethod: formData.get("refundMethod") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const meta = await getRequestMeta();
  let result;
  try {
    result = await cancelOrder(parsed.data.orderId, parsed.data.reason, parsed.data.refundMethod, { id: ctx.user.id, role: ctx.user.role });
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    throw error;
  }
  await audit("order.cancelled", { ...meta, actorUserId: ctx.user.id, metadata: { orderId: parsed.data.orderId, number: result.number, from: result.from, reason: parsed.data.reason, refundedPaisa: result.refundedPaisa, refundMethod: parsed.data.refundMethod ?? null } });
  revalidateOrder(parsed.data.orderId);
  redirect(`/orders/${parsed.data.orderId}?status=order_cancelled`);
}

export type PaymentFormState = { error: string | null; ok?: boolean; changePaisa?: number };

export async function recordPaymentAction(_previous: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = recordPaymentSchema.safeParse({ orderId: formData.get("orderId"), method: formData.get("method"), amount: formData.get("amount"), received: formData.get("received"), reference: formData.get("reference"), note: formData.get("note") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const meta = await getRequestMeta();
  let result;
  try {
    result = await recordPayment({ orderId: d.orderId, method: d.method, amountPaisa: d.amount, receivedPaisa: d.received ?? null, reference: d.reference, note: d.note }, { id: ctx.user.id, role: ctx.user.role });
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    throw error;
  }
  await audit("payment.recorded", { ...meta, actorUserId: ctx.user.id, metadata: { orderId: d.orderId, number: result.number, method: d.method, amountPaisa: d.amount, paidInFull: result.paidInFull } });
  revalidateOrder(d.orderId);
  return { error: null, ok: true, changePaisa: result.changePaisa };
}

export async function emailInvoiceAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const id = uuidSchema.safeParse(formData.get("orderId"));
  if (!id.success) redirect("/orders");
  const order = await getOrder(id.data);
  if (!order || !order.invoice) redirect(`/orders/${id.data}?status=invoice_missing`);
  const to = (formData.get("email") as string | null)?.trim() || order.customerEmail;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) redirect(`/orders/${id.data}?status=invoice_no_email`);
  const settings = await getSettings();
  await enqueueEmail({ toEmail: to, toName: order.customerName, subject: `Invoice ${order.invoice.number} from ${settings.store.name}`, template: "invoice", payload: { orderId: order.id }, createdBy: ctx.user.id });
  const meta = await getRequestMeta();
  await audit("invoice.emailed", { ...meta, actorUserId: ctx.user.id, metadata: { orderId: order.id, invoiceNumber: order.invoice.number, to } });
  scheduleEmailWork();
  redirect(`/orders/${id.data}?status=invoice_queued`);
}

export async function searchProductsForSaleAction(query: string): Promise<ProductSearchRow[]> {
  await requireRole(ROLE_GROUPS.staff);
  return searchProducts(query, { limit: 15 });
}

export async function lookupSaleBarcodeAction(code: string): Promise<ProductSearchRow | null> {
  await requireRole(ROLE_GROUPS.staff);
  return findProductByBarcode(code);
}
