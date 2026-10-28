"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PurchaseLinesEditor } from "@/components/purchase-lines-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductSearchRow } from "@/lib/products/queries";
import { submitSupplyAction, type VendorFormState } from "../../actions";

type Props = { search: (q: string) => Promise<ProductSearchRow[]>; lookupBarcode: (code: string) => Promise<ProductSearchRow | null> };

export function SubmitSupplyForm({ search, lookupBarcode }: Props) {
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(submitSupplyAction, { error: null });
  return (
    <form action={formAction} noValidate className="grid gap-6">
      <Card>
        <CardHeader><CardTitle>Delivery</CardTitle><CardDescription>Only your own products can be listed. Quantities are added to the store&apos;s stock once approved.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-2">
              <Field><FieldLabel htmlFor="invoiceRef">Your invoice number</FieldLabel><Input id="invoiceRef" name="invoiceRef" maxLength={80} data-scanner-ignore /></Field>
            </div>
            <Field><FieldLabel htmlFor="note">Note</FieldLabel><Textarea id="note" name="note" rows={2} data-scanner-ignore /></Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Items delivered</CardTitle></CardHeader>
        <CardContent><PurchaseLinesEditor search={search} lookupBarcode={lookupBarcode} /></CardContent>
      </Card>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit delivery"}</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/vendor" />}>Cancel</Button>
      </div>
    </form>
  );
}
