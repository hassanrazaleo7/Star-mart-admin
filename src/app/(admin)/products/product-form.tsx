"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";
import { ImageUpload } from "@/components/image-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_STATUSES, UNITS, type Product } from "@/db/schema";
import { paisaToDecimalString } from "@/lib/money";
import { generateBarcodeAction, saveProductAction, type ProductFormState } from "./actions";

type Option = { id: string; name: string };

type Props = {
  product?: Product | null;
  categories: Option[];
  suppliers: Option[];
  blobEnabled: boolean;
  defaultTaxBps: number;
  defaultReorderLevel: number;
  defaultExpiryWarningDays: number;
};

export function ProductForm({ product, categories, suppliers, blobEnabled, defaultTaxBps, defaultReorderLevel, defaultExpiryWarningDays }: Props) {
  const [tracksExpiry, setTracksExpiry] = useState(product?.tracksExpiry ?? false);
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(saveProductAction, { error: null });
  const [imageUploading, setImageUploading] = useState(false);
  const isEdit = Boolean(product);

  return (
    <form action={formAction} noValidate className="grid gap-6" onSubmit={(event) => { if (imageUploading) event.preventDefault(); }}>
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" name="name" defaultValue={product?.name ?? ""} required maxLength={200} autoFocus={!isEdit} />
                </Field>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="sku">SKU</FieldLabel>
                    <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} required maxLength={64} className="font-mono uppercase" data-scanner-ignore />
                    <FieldDescription>Unique code, e.g. RICE-5KG.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
                    <BarcodeInput id="barcode" name="barcode" defaultValue={product?.barcode} generate={generateBarcodeAction} />
                    <FieldDescription>EAN-13 or any code printed on the item.</FieldDescription>
                  </Field>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                    <NativeSelect className="w-full" id="categoryId" name="categoryId" defaultValue={product?.categoryId ?? ""}>
                      <NativeSelectOption value="">Uncategorised</NativeSelectOption>
                      {categories.map((c) => (
                        <NativeSelectOption key={c.id} value={c.id}>
                          {c.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="brand">Brand</FieldLabel>
                    <Input id="brand" name="brand" defaultValue={product?.brand ?? ""} maxLength={100} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <Textarea id="description" name="description" defaultValue={product?.description ?? ""} rows={3} data-scanner-ignore />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>Prices include tax. Cost is what you pay the supplier.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 md:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="costPaisa">Cost (PKR)</FieldLabel>
                  <Input id="costPaisa" name="costPaisa" inputMode="decimal" defaultValue={product ? paisaToDecimalString(product.costPaisa) : "0.00"} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pricePaisa">Selling price (PKR)</FieldLabel>
                  <Input id="pricePaisa" name="pricePaisa" inputMode="decimal" defaultValue={product ? paisaToDecimalString(product.pricePaisa) : "0.00"} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="taxRateBps">Tax rate (%)</FieldLabel>
                  <Input id="taxRateBps" name="taxRateBps" type="number" step="0.01" min={0} max={100} defaultValue={((product?.taxRateBps ?? defaultTaxBps) / 100).toString()} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 self-start">
          <Card>
            <CardHeader>
              <CardTitle>Image</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUpload enabled={blobEnabled} initialUrl={product?.imageUrl} initialPathname={product?.imagePathname} onUploadingChange={setImageUploading} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Stock & unit</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="unit">Unit</FieldLabel>
                  <NativeSelect className="w-full" id="unit" name="unit" defaultValue={product?.unit ?? "pcs"}>
                    {UNITS.map((u) => (
                      <NativeSelectOption key={u} value={u}>
                        {u}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field orientation="horizontal">
                  <Switch id="allowFractional" name="allowFractional" defaultChecked={product?.allowFractional ?? false} />
                  <div className="grid gap-0.5">
                    <FieldLabel htmlFor="allowFractional">Sold in fractions</FieldLabel>
                    <FieldDescription>Allow quantities like 1.5 kg.</FieldDescription>
                  </div>
                </Field>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="reorderLevel">Reorder level</FieldLabel>
                    <Input id="reorderLevel" name="reorderLevel" type="number" step="0.001" min={0} defaultValue={product?.reorderLevel ?? defaultReorderLevel} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="reorderQty">Reorder quantity</FieldLabel>
                    <Input id="reorderQty" name="reorderQty" type="number" step="0.001" min={0} defaultValue={product?.reorderQty ?? 0} />
                  </Field>
                </div>
                {!isEdit ? (
                  <Field>
                    <FieldLabel htmlFor="initialStock">Opening stock</FieldLabel>
                    <Input id="initialStock" name="initialStock" type="number" step="0.001" min={0} defaultValue={0} />
                    <FieldDescription>Recorded as an opening stock movement at cost.</FieldDescription>
                  </Field>
                ) : (
                  <FieldDescription>Current stock: {product?.stockQty} {product?.unit}. Use Stock → Adjust to change it.</FieldDescription>
                )}
                <Field>
                  <FieldLabel htmlFor="supplierId">Supplier</FieldLabel>
                  <NativeSelect className="w-full" id="supplierId" name="supplierId" defaultValue={product?.supplierId ?? ""}>
                    <NativeSelectOption value="">None</NativeSelectOption>
                    {suppliers.map((s) => (
                      <NativeSelectOption key={s.id} value={s.id}>
                        {s.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <NativeSelect className="w-full" id="status" name="status" defaultValue={product?.status ?? "active"}>
                    {PRODUCT_STATUSES.map((s) => (
                      <NativeSelectOption key={s} value={s}>
                        {s}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Expiry</CardTitle>
              <CardDescription>Stock is tracked in batches; sales take the earliest expiry first.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field orientation="horizontal">
                  <Switch id="tracksExpiry" name="tracksExpiry" checked={tracksExpiry} onCheckedChange={(checked) => setTracksExpiry(checked)} />
                  <div className="grid gap-0.5">
                    <FieldLabel htmlFor="tracksExpiry">Perishable: track expiry dates</FieldLabel>
                    <FieldDescription>Every delivery must then carry an expiry date.</FieldDescription>
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="shelfLifeDays">Shelf life (days)</FieldLabel>
                    <Input id="shelfLifeDays" name="shelfLifeDays" type="number" min={1} max={3650} step={1} defaultValue={product?.shelfLifeDays ?? ""} placeholder="e.g. 180" />
                    <FieldDescription>Pre-fills the expiry when receiving.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="expiryWarningDays">Warn days before</FieldLabel>
                    <Input id="expiryWarningDays" name="expiryWarningDays" type="number" min={0} max={365} step={1} defaultValue={product?.expiryWarningDays ?? ""} placeholder={`Store default (${defaultExpiryWarningDays})`} />
                  </Field>
                </div>
                {!isEdit ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="initialBatchCode">Opening stock batch</FieldLabel>
                      <Input id="initialBatchCode" name="initialBatchCode" maxLength={60} data-scanner-ignore />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="initialExpiry">Opening stock expiry</FieldLabel>
                      <Input id="initialExpiry" name="initialExpiry" type="date" required={tracksExpiry} />
                    </Field>
                  </div>
                ) : (
                  <FieldDescription>
                    Batches and their expiry dates are listed <a href="#batches" className="underline">below</a>.
                  </FieldDescription>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || imageUploading}>
          {pending ? "Saving…" : imageUploading ? "Uploading image…" : isEdit ? "Save changes" : "Create product"}
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/products" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
