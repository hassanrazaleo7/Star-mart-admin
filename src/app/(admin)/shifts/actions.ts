"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";
import { closeShift, reopenShift, ShiftError } from "@/lib/shifts/commands";
import { firstIssue, uuidSchema } from "@/lib/validation/common";
import { closeShiftSchema } from "@/lib/validation/shifts";

export async function reopenShiftAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("shiftId"));
  if (!id.success) redirect("/shifts");
  try {
    const r = await reopenShift(id.data, { id: ctx.user.id, role: ctx.user.role });
    const meta = await getRequestMeta();
    await audit("shift.reopened", { ...meta, actorUserId: ctx.user.id, metadata: { shiftId: id.data, number: r.number, cashierUserId: r.cashierUserId } });
  } catch (error) {
    if (error instanceof ShiftError) redirect(`/shifts/${id.data}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath("/shifts");
  revalidatePath(`/shifts/${id.data}`);
  redirect(`/shifts/${id.data}?status=shift_reopened`);
}

export type CloseFormState = { error: string | null };

export async function closeShiftFormAction(_previous: CloseFormState, formData: FormData): Promise<CloseFormState> {
  const ctx = await requireRole(ROLE_GROUPS.staff);
  const parsed = closeShiftSchema.safeParse({ shiftId: formData.get("shiftId"), countedCashPaisa: formData.get("countedCashPaisa"), notes: formData.get("notes") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    const r = await closeShift({ shiftId: parsed.data.shiftId, countedCashPaisa: parsed.data.countedCashPaisa, notes: parsed.data.notes }, { id: ctx.user.id, role: ctx.user.role });
    const meta = await getRequestMeta();
    await audit("shift.closed", { ...meta, actorUserId: ctx.user.id, metadata: { shiftId: parsed.data.shiftId, number: r.number, expectedCashPaisa: r.expectedCashPaisa, countedCashPaisa: parsed.data.countedCashPaisa, variancePaisa: r.variancePaisa, salesCount: r.salesCount } });
  } catch (error) {
    if (error instanceof ShiftError) return { error: error.message };
    throw error;
  }
  revalidatePath("/shifts");
  revalidatePath(`/shifts/${parsed.data.shiftId}`);
  redirect(`/shifts/${parsed.data.shiftId}?status=shift_closed`);
}
