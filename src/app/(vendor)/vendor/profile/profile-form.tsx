"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Supplier } from "@/db/schema";
import { updateSupplierProfileAction, type VendorFormState } from "../actions";

export function ProfileForm({ supplier }: { supplier: Supplier }) {
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(updateSupplierProfileAction, { error: null });
  return (
    <form action={formAction} noValidate className="grid max-w-2xl gap-5">
      <FieldGroup>
        <Field><FieldLabel htmlFor="name">Business name</FieldLabel><Input id="name" name="name" defaultValue={supplier.name} required maxLength={120} /></Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field><FieldLabel htmlFor="contactName">Contact person</FieldLabel><Input id="contactName" name="contactName" defaultValue={supplier.contactName ?? ""} /></Field>
          <Field><FieldLabel htmlFor="phone">Phone</FieldLabel><Input id="phone" name="phone" defaultValue={supplier.phone ?? ""} /></Field>
          <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" defaultValue={supplier.email ?? ""} /></Field>
        </div>
        <Field><FieldLabel htmlFor="address">Address</FieldLabel><Textarea id="address" name="address" defaultValue={supplier.address ?? ""} rows={2} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field><FieldLabel htmlFor="taxId">Tax / NTN number</FieldLabel><Input id="taxId" name="taxId" defaultValue={supplier.taxId ?? ""} /></Field>
          <Field><FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel><Input id="paymentTerms" name="paymentTerms" defaultValue={supplier.paymentTerms ?? ""} /></Field>
        </div>
      </FieldGroup>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button></div>
    </form>
  );
}
