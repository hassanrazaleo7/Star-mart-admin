"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { adjustPointsAction, recordCreditPaymentAction, type LedgerFormState } from "../actions";

export function AdjustPointsForm({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState<LedgerFormState, FormData>(async (prev, fd) => {
    const r = await adjustPointsAction(prev, fd);
    if (r.ok) toast.success("Points adjusted.", { id: "points-adjust" });
    return r;
  }, { error: null });
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-4">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <Field><FieldLabel htmlFor="pointsDelta">Points (+ / −)</FieldLabel><Input id="pointsDelta" name="pointsDelta" type="number" step={1} required placeholder="e.g. 500 or -200" data-scanner-ignore /></Field>
        <Field><FieldLabel htmlFor="pointsNote">Reason</FieldLabel><Input id="pointsNote" name="note" required minLength={3} maxLength={200} placeholder="Goodwill, correction…" data-scanner-ignore /></Field>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Adjust"}</Button>
      </div>
      <FieldDescription>Manual adjustments are logged with your name.</FieldDescription>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    </form>
  );
}

export function RecordCreditPaymentForm({ customerId, outstandingPaisa }: { customerId: string; outstandingPaisa: number }) {
  const [state, formAction, pending] = useActionState<LedgerFormState, FormData>(async (prev, fd) => {
    const r = await recordCreditPaymentAction(prev, fd);
    if (r.ok) toast.success("Payment recorded.", { id: "credit-payment" });
    return r;
  }, { error: null });
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-4">
      <input type="hidden" name="customerId" value={customerId} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field><FieldLabel htmlFor="creditAmount">Amount (PKR)</FieldLabel><Input id="creditAmount" name="amount" inputMode="decimal" defaultValue={(outstandingPaisa / 100).toFixed(2)} required data-scanner-ignore /></Field>
          <Field><FieldLabel htmlFor="creditMethod">Method</FieldLabel><NativeSelect className="w-full" id="creditMethod" name="method" defaultValue="cash"><NativeSelectOption value="cash">Cash</NativeSelectOption><NativeSelectOption value="card">Card</NativeSelectOption><NativeSelectOption value="bank_transfer">Bank transfer</NativeSelectOption></NativeSelect></Field>
          <Field><FieldLabel htmlFor="creditRef">Reference</FieldLabel><Input id="creditRef" name="reference" maxLength={100} data-scanner-ignore /></Field>
          <Button type="submit" disabled={pending || outstandingPaisa <= 0}>{pending ? "Saving…" : "Record payment"}</Button>
        </div>
      </FieldGroup>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    </form>
  );
}
