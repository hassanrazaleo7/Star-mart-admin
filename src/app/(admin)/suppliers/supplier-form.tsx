"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Supplier } from "@/db/schema";
import { saveSupplierAction, type FormState } from "./actions";

export function SupplierForm({ supplier }: { supplier?: Supplier | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveSupplierAction, { error: null });
  return (
    <form action={formAction} noValidate className="grid gap-6">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Supplier name</FieldLabel>
              <Input id="name" name="name" defaultValue={supplier?.name ?? ""} required maxLength={120} autoFocus={!supplier} />
            </Field>
            <div className="grid gap-5 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="contactName">Contact person</FieldLabel>
                <Input id="contactName" name="contactName" defaultValue={supplier?.contactName ?? ""} maxLength={120} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} maxLength={40} />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} maxLength={254} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Textarea id="address" name="address" defaultValue={supplier?.address ?? ""} rows={2} />
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="taxId">Tax / NTN number</FieldLabel>
                <Input id="taxId" name="taxId" defaultValue={supplier?.taxId ?? ""} maxLength={60} />
              </Field>
              <Field>
                <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
                <Input id="paymentTerms" name="paymentTerms" defaultValue={supplier?.paymentTerms ?? ""} maxLength={200} placeholder="e.g. Net 30" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" name="notes" defaultValue={supplier?.notes ?? ""} rows={3} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : supplier ? "Save changes" : "Create supplier"}
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href={supplier ? `/suppliers/${supplier.id}` : "/suppliers"} />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
