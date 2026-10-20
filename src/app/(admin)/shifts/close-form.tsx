"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { paisaToDecimalString } from "@/lib/money";
import { closeShiftFormAction, type CloseFormState } from "./actions";

export function CloseShiftForm({ shiftId, expectedCashPaisa, defaultNotes }: { shiftId: string; expectedCashPaisa: number; defaultNotes: string }) {
  const [state, formAction, pending] = useActionState<CloseFormState, FormData>(closeShiftFormAction, { error: null });
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-4">
      <input type="hidden" name="shiftId" value={shiftId} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <Field><FieldLabel htmlFor="countedCashPaisa">Counted cash (PKR)</FieldLabel><Input id="countedCashPaisa" name="countedCashPaisa" inputMode="decimal" placeholder={paisaToDecimalString(expectedCashPaisa)} required data-scanner-ignore /></Field>
        <Field><FieldLabel htmlFor="closeNotes">Notes</FieldLabel><Input id="closeNotes" name="notes" defaultValue={defaultNotes} maxLength={500} data-scanner-ignore /></Field>
        <Button type="submit" disabled={pending}>{pending ? "Closing…" : "Close shift"}</Button>
      </div>
      <FieldDescription>Expected cash in drawer right now: {paisaToDecimalString(expectedCashPaisa)}.</FieldDescription>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    </form>
  );
}
