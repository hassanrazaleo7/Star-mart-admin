import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { posShifts, type AdminRole } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { nextDocumentNumber } from "@/lib/documents";
import { isManager } from "@/lib/rbac";
import { shiftSummary } from "./queries";

export class ShiftError extends Error {}
type Actor = { id: string; role: AdminRole };

export async function openShift(input: { openingFloatPaisa: number; notes: string | null }, actor: Actor) {
  const number = await nextDocumentNumber("shift", "SHIFT");
  try {
    const [row] = await db.insert(posShifts).values({ number, cashierUserId: actor.id, openingFloatPaisa: input.openingFloatPaisa, notes: input.notes }).returning({ id: posShifts.id, number: posShifts.number });
    return row!;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ShiftError("You already have an open shift. Close it before opening another.");
    throw error;
  }
}

/** Closes (or re-closes after a reopen) a shift with the counted cash; the expected cash is recomputed from the orders. */
export async function closeShift(input: { shiftId: string; countedCashPaisa: number; notes: string | null }, actor: Actor) {
  const shift = await db.query.posShifts.findFirst({ where: eq(posShifts.id, input.shiftId) });
  if (!shift) throw new ShiftError("Shift not found.");
  if (shift.cashierUserId !== actor.id && !isManager(actor.role)) throw new ShiftError("Only the cashier who opened this shift, or a manager, can close it.");
  if (shift.status !== "open") throw new ShiftError("This shift is already closed.");
  const summary = await shiftSummary(shift.id, shift.openingFloatPaisa);
  const variance = input.countedCashPaisa - summary.expectedCashPaisa;
  const rows = await db
    .update(posShifts)
    .set({ status: "closed", closedAt: sql`now()`, closedBy: actor.id, expectedCashPaisa: summary.expectedCashPaisa, countedCashPaisa: input.countedCashPaisa, variancePaisa: variance, notes: input.notes ?? shift.notes, updatedAt: sql`now()` })
    .where(and(eq(posShifts.id, shift.id), eq(posShifts.status, "open")))
    .returning({ id: posShifts.id });
  if (!rows.length) throw new ShiftError("This shift was closed by someone else. Reload and try again.");
  return { number: shift.number, expectedCashPaisa: summary.expectedCashPaisa, variancePaisa: variance, salesCount: summary.salesCount };
}

/** Managers reopen a closed shift to correct the count; refused while the cashier has another open shift. */
export async function reopenShift(shiftId: string, actor: Actor) {
  if (!isManager(actor.role)) throw new ShiftError("Only managers can reopen a shift.");
  const shift = await db.query.posShifts.findFirst({ where: eq(posShifts.id, shiftId) });
  if (!shift) throw new ShiftError("Shift not found.");
  if (shift.status !== "closed") throw new ShiftError("This shift is not closed.");
  try {
    const rows = await db
      .update(posShifts)
      .set({ status: "open", reopenedAt: sql`now()`, reopenedBy: actor.id, countedCashPaisa: null, variancePaisa: null, expectedCashPaisa: null, closedAt: null, closedBy: null, updatedAt: sql`now()` })
      .where(and(eq(posShifts.id, shiftId), eq(posShifts.status, "closed")))
      .returning({ id: posShifts.id });
    if (!rows.length) throw new ShiftError("The shift changed while reopening. Reload and try again.");
  } catch (error) {
    if (isUniqueViolation(error)) throw new ShiftError("That cashier already has another open shift; close it first.");
    throw error;
  }
  return { number: shift.number, cashierUserId: shift.cashierUserId };
}
