"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BarcodeInput } from "@/components/barcode-input";
import { ImageUpload } from "@/components/image-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UNITS } from "@/db/schema";
import { submitProductAction, type VendorFormState } from "../../actions";

export function SubmitProductForm({ blobEnabled, categories }: { blobEnabled: boolean; categories: string[] }) {
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(submitProductAction, { error: null });
  return (
    <form action={formAction} noValidate className="grid gap-6">
      <Card>
        <CardContent>
          <FieldGroup>
            <Field><FieldLabel htmlFor="name">Product name</FieldLabel><Input id="name" name="name" required maxLength={200} autoFocus /></Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field><FieldLabel htmlFor="sku">Your product code (optional)</FieldLabel><Input id="sku" name="sku" maxLength={64} data-scanner-ignore /></Field>
              <Field><FieldLabel htmlFor="barcode">Barcode</FieldLabel><BarcodeInput id="barcode" name="barcode" /><FieldDescription>Scan or type the barcode printed on the item.</FieldDescription></Field>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <Field><FieldLabel htmlFor="categoryName">Category</FieldLabel><Input id="categoryName" name="categoryName" list="category-suggestions" maxLength={80} /><datalist id="category-suggestions">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
              <Field><FieldLabel htmlFor="unit">Unit</FieldLabel><NativeSelect className="w-full" id="unit" name="unit" defaultValue="pcs">{UNITS.map((u) => <NativeSelectOption key={u} value={u}>{u}</NativeSelectOption>)}</NativeSelect></Field>
              <Field orientation="horizontal"><Switch id="allowFractional" name="allowFractional" /><FieldLabel htmlFor="allowFractional">Sold in fractions</FieldLabel></Field>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <Field><FieldLabel htmlFor="costPaisa">Your price to the store (PKR)</FieldLabel><Input id="costPaisa" name="costPaisa" inputMode="decimal" defaultValue="0.00" required /></Field>
              <Field><FieldLabel htmlFor="suggestedPricePaisa">Suggested retail price (PKR)</FieldLabel><Input id="suggestedPricePaisa" name="suggestedPricePaisa" inputMode="decimal" defaultValue="0.00" /></Field>
              <Field><FieldLabel htmlFor="taxRateBps">Tax rate (%)</FieldLabel><Input id="taxRateBps" name="taxRateBps" type="number" step="0.01" min={0} max={100} defaultValue={0} /></Field>
            </div>
            <Field><FieldLabel htmlFor="description">Description</FieldLabel><Textarea id="description" name="description" rows={3} data-scanner-ignore /></Field>
            <Field><FieldLabel>Image</FieldLabel><ImageUpload enabled={blobEnabled} /></Field>
            <Field><FieldLabel htmlFor="note">Note to the store</FieldLabel><Textarea id="note" name="note" rows={2} data-scanner-ignore /></Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit for approval"}</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/vendor" />}>Cancel</Button>
      </div>
    </form>
  );
}
