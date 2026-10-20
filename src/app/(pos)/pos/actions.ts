"use server";

import { scheduleEmailWork } from "@/lib/email/schedule";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { createOrder, OrderError } from "@/lib/orders/commands";
import { posSaleSchema } from "@/lib/orders/validation";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { closeShift, openShift, ShiftError } from "@/lib/shifts/commands";
import { currentShiftFor, getShift, shiftSummary, type ShiftSummary } from "@/lib/shifts/queries";
import { closeShiftSchema, openShiftSchema } from "@/lib/validation/shifts";

export type PosSaleResult =
  | { ok: true; orderId: string; number: string; totalPaisa: number; paidPaisa: number; changePaisa: number; pointsEarned: number; invoiceNumber: string | null }
  | { ok: false; error: string; code?: "no_shift" };

/** Completes a till sale: stock, payments, points, invoice and receipt in one transaction. */
export async function createPosSaleAction(raw: unknown): Promise<PosSaleResult> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = posSaleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid sale" };
  const d = parsed.data;
  const shift = await currentShiftFor(ctx.user.id);
  if (!shift) return { ok: false, error: "Open a shift before selling.", code: "no_shift" };
  const meta = await getRequestMeta();
  try {
    const result = await createOrder(
      {
        channel: "pos",
        shiftId: shift.id,
        fulfillment: "pickup",
        customerId: d.customerId ?? null,
        customerName: d.guest?.name ?? null,
        customerPhone: d.guest?.phone ?? null,
        customerEmail: d.guest?.email ?? null,
        notes: d.notes,
        lines: d.lines,
        discountCode: d.discountCode,
        pointsToRedeem: d.pointsToRedeem,
        payments: d.payments,
        allowPriceOverride: isManager(ctx.user.role),
      },
      { id: ctx.user.id, role: ctx.user.role },
    );
    await audit("order.created", { ...meta, actorUserId: ctx.user.id, metadata: { orderId: result.id, number: result.number, channel: "pos", totalPaisa: result.totalPaisa, paidPaisa: result.paidPaisa, guest: Boolean(d.guest) } });
    revalidatePath("/orders");
    revalidatePath("/stock");
    revalidatePath("/dashboard");
    scheduleEmailWork({ lowStock: true });
    return { ok: true, orderId: result.id, number: result.number, totalPaisa: result.totalPaisa, paidPaisa: result.paidPaisa, changePaisa: result.changePaisa, pointsEarned: result.pointsEarned, invoiceNumber: result.invoiceNumber };
  } catch (error) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    throw error;
  }
}

export type ShiftActionResult = { ok: true; shiftId: string; number: string } | { ok: false; error: string };

export async function openShiftAction(raw: unknown): Promise<ShiftActionResult> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = openShiftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const shift = await openShift({ openingFloatPaisa: parsed.data.openingFloatPaisa, notes: parsed.data.notes }, { id: ctx.user.id, role: ctx.user.role });
    const meta = await getRequestMeta();
    await audit("shift.opened", { ...meta, actorUserId: ctx.user.id, metadata: { shiftId: shift.id, number: shift.number, openingFloatPaisa: parsed.data.openingFloatPaisa } });
    revalidatePath("/shifts");
    revalidatePath("/pos");
    return { ok: true, shiftId: shift.id, number: shift.number };
  } catch (error) {
    if (error instanceof ShiftError) return { ok: false, error: error.message };
    throw error;
  }
}

export type CloseShiftResult = { ok: true; shiftId: string; number: string; expectedCashPaisa: number; variancePaisa: number } | { ok: false; error: string };

export async function closeShiftAction(raw: unknown): Promise<CloseShiftResult> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = closeShiftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const r = await closeShift({ shiftId: parsed.data.shiftId, countedCashPaisa: parsed.data.countedCashPaisa, notes: parsed.data.notes }, { id: ctx.user.id, role: ctx.user.role });
    const meta = await getRequestMeta();
    await audit("shift.closed", { ...meta, actorUserId: ctx.user.id, metadata: { shiftId: parsed.data.shiftId, number: r.number, expectedCashPaisa: r.expectedCashPaisa, countedCashPaisa: parsed.data.countedCashPaisa, variancePaisa: r.variancePaisa, salesCount: r.salesCount } });
    revalidatePath("/shifts");
    revalidatePath(`/shifts/${parsed.data.shiftId}`);
    revalidatePath("/pos");
    return { ok: true, shiftId: parsed.data.shiftId, number: r.number, expectedCashPaisa: r.expectedCashPaisa, variancePaisa: r.variancePaisa };
  } catch (error) {
    if (error instanceof ShiftError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Live totals for the close-shift dialog. */
export async function shiftSummaryAction(shiftId: string): Promise<{ ok: true; summary: ShiftSummary; number: string; openingFloatPaisa: number } | { ok: false; error: string }> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const shift = await getShift(shiftId);
  if (!shift || (shift.cashierUserId !== ctx.user.id && !isManager(ctx.user.role))) return { ok: false, error: "Shift not found." };
  return { ok: true, summary: await shiftSummary(shift.id, shift.openingFloatPaisa), number: shift.number, openingFloatPaisa: shift.openingFloatPaisa };
}
