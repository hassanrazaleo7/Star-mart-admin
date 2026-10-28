"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PurchaseLinesEditor } from "@/components/purchase-lines-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ProductSearchRow } from "@/lib/products/queries";
import { createPurchaseAction, type PurchaseFormState } from "./actions";

type Props = {
  suppliers: { id: string; name: string }[];
  defaultSupplierId?: string;
  search: (q: string) => Promise<ProductSearchRow[]>;
  lookupBarcode: (code: string) => Promise<ProductSearchRow | null>;
};

export function PurchaseForm({ suppliers, defaultSupplierId, search, lookupBarcode }: Props) {
  const [state, formAction, pending] = useActionState<PurchaseFormState, FormData>(createPurchaseAction, { error: null });
  return (
    <form action={formAction} noValidate className="grid gap-6">
      <Card>
        <CardHeader><CardTitle>Purchase details</CardTitle></CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="supplierId">Supplier</FieldLabel>
                <NativeSelect className="w-full" id="supplierId" name="supplierId" defaultValue={defaultSupplierId ?? ""} required>
                  <NativeSelectOption value="">Select a supplier…</NativeSelectOption>
                  {suppliers.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="invoiceRef">Supplier invoice no.</FieldLabel>
                <Input id="invoiceRef" name="invoiceRef" maxLength={80} data-scanner-ignore />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" name="notes" rows={2} data-scanner-ignore />
            </Field>
            <Field orientation="horizontal">
              <Switch id="receiveNow" name="receiveNow" defaultChecked />
              <div className="grid gap-0.5">
                <FieldLabel htmlFor="receiveNow">Goods received now</FieldLabel>
                <FieldDescription>Books the stock immediately and updates product costs. Untick to save as a draft order.</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <PurchaseLinesEditor search={search} lookupBarcode={lookupBarcode} />
        </CardContent>
      </Card>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save purchase"}</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/purchases" />}>Cancel</Button>
      </div>
    </form>
  );
}
