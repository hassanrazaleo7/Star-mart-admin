"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Expense } from "@/db/schema";
import { paisaToDecimalString } from "@/lib/money";
import { saveExpenseAction, type ExpenseFormState } from "./actions";

type Props = { expense?: Expense | null; categories: { id: string; name: string }[]; today: string };

export function ExpenseForm({ expense, categories, today }: Props) {
  const [state, formAction, pending] = useActionState<ExpenseFormState, FormData>(saveExpenseAction, { error: null });
  return (
    <form action={formAction} noValidate className="grid gap-6">
      {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-3">
              <Field><FieldLabel htmlFor="incurredAt">Date</FieldLabel><Input id="incurredAt" name="incurredAt" type="date" defaultValue={expense?.incurredAt ?? today} required /></Field>
              <Field>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <NativeSelect className="w-full" id="categoryId" name="categoryId" defaultValue={expense?.categoryId ?? ""} required>
                  <NativeSelectOption value="">Select…</NativeSelectOption>
                  {categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
                </NativeSelect>
                {categories.length === 0 ? <FieldDescription>Create a category on the Expenses page first.</FieldDescription> : null}
              </Field>
              <Field><FieldLabel htmlFor="amountPaisa">Amount (PKR)</FieldLabel><Input id="amountPaisa" name="amountPaisa" inputMode="decimal" defaultValue={expense ? paisaToDecimalString(expense.amountPaisa) : ""} required data-scanner-ignore /></Field>
            </div>
            <Field><FieldLabel htmlFor="description">Description</FieldLabel><Input id="description" name="description" defaultValue={expense?.description ?? ""} required maxLength={200} data-scanner-ignore /></Field>
            <div className="grid gap-5 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="method">Paid by</FieldLabel>
                <NativeSelect className="w-full" id="method" name="method" defaultValue={expense?.method ?? "cash"}><NativeSelectOption value="cash">Cash</NativeSelectOption><NativeSelectOption value="card">Card</NativeSelectOption><NativeSelectOption value="bank_transfer">Bank transfer</NativeSelectOption></NativeSelect>
              </Field>
              <Field><FieldLabel htmlFor="reference">Reference</FieldLabel><Input id="reference" name="reference" defaultValue={expense?.reference ?? ""} maxLength={100} data-scanner-ignore /></Field>
              <Field><FieldLabel htmlFor="receiptUrl">Receipt link</FieldLabel><Input id="receiptUrl" name="receiptUrl" type="url" defaultValue={expense?.receiptUrl ?? ""} placeholder="https://…" data-scanner-ignore /></Field>
            </div>
            {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : expense ? "Save expense" : "Add expense"}</Button>
        <Button type="button" variant="outline" nativeButton={false} render={<Link href="/expenses" />}>Cancel</Button>
      </div>
    </form>
  );
}
