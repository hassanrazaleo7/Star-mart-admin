"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SUPPLIER_PAYMENT_METHODS } from "@/db/schema";
import { paisaToDecimalString } from "@/lib/money";
import { recordPurchaseReturnAction, recordSupplierPaymentAction, type FormState } from "../actions";

type PurchaseOption = { id: string; number: string; outstandingPaisa: number };
type ProductOption = { id: string; name: string; sku: string; unit: string; stockQty: number; costPaisa: number };

export function RecordPaymentDialog({ supplierId, purchases, defaultPurchaseId, trigger }: { supplierId: string; purchases: PurchaseOption[]; defaultPurchaseId?: string; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await recordSupplierPaymentAction(prev, fd);
    if (result.ok) {
      toast.success("Payment recorded.", { id: "supplier-payment" });
      setOpen(false);
    }
    return result;
  }, { error: null });
  const [purchaseId, setPurchaseId] = useState(defaultPurchaseId ?? "");
  const selected = purchases.find((p) => p.id === purchaseId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button variant="outline" />}>Record payment</DialogTrigger>
      <DialogContent>
        <form action={formAction} noValidate>
          <DialogHeader>
            <DialogTitle>Record supplier payment</DialogTitle>
            <DialogDescription>Reduces what the store owes this supplier.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="supplierId" value={supplierId} />
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="pay-purchase">Purchase</FieldLabel>
              <NativeSelect className="w-full" id="pay-purchase" name="purchaseId" value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
                <NativeSelectOption value="">On account (no specific purchase)</NativeSelectOption>
                {purchases.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.number} · outstanding {paisaToDecimalString(p.outstandingPaisa)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="pay-amount">Amount (PKR)</FieldLabel>
                <Input id="pay-amount" name="amount" inputMode="decimal" defaultValue={selected ? paisaToDecimalString(selected.outstandingPaisa) : ""} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="pay-method">Method</FieldLabel>
                <NativeSelect className="w-full" id="pay-method" name="method" defaultValue="bank_transfer">
                  {SUPPLIER_PAYMENT_METHODS.map((m) => (
                    <NativeSelectOption key={m} value={m}>{m.replace("_", " ")}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="pay-reference">Reference</FieldLabel>
                <Input id="pay-reference" name="reference" maxLength={100} />
              </Field>
              <Field>
                <FieldLabel htmlFor="pay-date">Date</FieldLabel>
                <Input id="pay-date" name="paidAt" type="date" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="pay-note">Note</FieldLabel>
              <Textarea id="pay-note" name="note" rows={2} />
            </Field>
            {state.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordReturnDialog({ supplierId, products, purchases }: { supplierId: string; products: ProductOption[]; purchases: PurchaseOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await recordPurchaseReturnAction(prev, fd);
    if (result.ok) {
      toast.success("Return recorded.", { id: "purchase-return" });
      setOpen(false);
    }
    return result;
  }, { error: null });
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const product = products.find((p) => p.id === productId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Record return</DialogTrigger>
      <DialogContent>
        <form action={formAction} noValidate>
          <DialogHeader>
            <DialogTitle>Return goods to supplier</DialogTitle>
            <DialogDescription>Removes the quantity from stock and credits the amount against the supplier balance.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="supplierId" value={supplierId} />
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="ret-product">Product</FieldLabel>
              <NativeSelect className="w-full" id="ret-product" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>{p.name} ({p.sku}) · {p.stockQty} {p.unit} on hand</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ret-qty">Quantity</FieldLabel>
                <Input id="ret-qty" name="qty" type="number" min={0.001} step="0.001" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ret-amount">Credit amount (PKR)</FieldLabel>
                <Input id="ret-amount" name="amount" inputMode="decimal" defaultValue={product ? paisaToDecimalString(Math.round(product.costPaisa * qty)) : "0"} key={`${productId}-${qty}`} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ret-purchase">Related purchase</FieldLabel>
              <NativeSelect className="w-full" id="ret-purchase" name="purchaseId" defaultValue="">
                <NativeSelectOption value="">None</NativeSelectOption>
                {purchases.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>{p.number}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="ret-reason">Reason</FieldLabel>
              <Input id="ret-reason" name="reason" maxLength={300} placeholder="Damaged, expired, wrong item…" />
            </Field>
            {state.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || products.length === 0}>{pending ? "Saving…" : "Record return"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
