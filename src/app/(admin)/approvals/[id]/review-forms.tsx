"use client";

import { useActionState, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UNITS } from "@/db/schema";
import { paisaToDecimalString } from "@/lib/money";
import { generateBarcodeAction } from "../../products/actions";
import { approveProductSubmissionAction, approveSupplySubmissionAction, rejectSubmissionAction, type ReviewState } from "../actions";

type ProductPayload = { name: string; sku?: string; barcode?: string; description?: string; unit: string; allowFractional: boolean; costPaisa: number; suggestedPricePaisa: number; taxRateBps: number; categoryName?: string; imageUrl?: string; imagePathname?: string };

export function ApproveProductForm({ submissionId, payload, categories, defaultReorderLevel }: { submissionId: string; payload: ProductPayload; categories: { id: string; name: string }[]; defaultReorderLevel: number }) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(approveProductSubmissionAction, { error: null });
  const matchedCategory = categories.find((c) => c.name.toLowerCase() === (payload.categoryName ?? "").toLowerCase());
  return (
    <form action={formAction} noValidate className="grid gap-5">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="imageUrl" value={payload.imageUrl ?? ""} />
      <input type="hidden" name="imagePathname" value={payload.imagePathname ?? ""} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name="name" defaultValue={payload.name} required /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field><FieldLabel htmlFor="sku">SKU</FieldLabel><Input id="sku" name="sku" defaultValue={payload.sku ?? ""} required className="font-mono uppercase" data-scanner-ignore /></Field>
          <Field><FieldLabel htmlFor="barcode">Barcode</FieldLabel><BarcodeInput id="barcode" name="barcode" defaultValue={payload.barcode} generate={generateBarcodeAction} /></Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field><FieldLabel htmlFor="categoryId">Category</FieldLabel><NativeSelect className="w-full" id="categoryId" name="categoryId" defaultValue={matchedCategory?.id ?? ""}><NativeSelectOption value="">Uncategorised{payload.categoryName ? ` (suggested: ${payload.categoryName})` : ""}</NativeSelectOption>{categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="brand">Brand</FieldLabel><Input id="brand" name="brand" /></Field>
          <Field><FieldLabel htmlFor="unit">Unit</FieldLabel><NativeSelect className="w-full" id="unit" name="unit" defaultValue={payload.unit}>{UNITS.map((u) => <NativeSelectOption key={u} value={u}>{u}</NativeSelectOption>)}</NativeSelect></Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field><FieldLabel htmlFor="costPaisa">Cost (PKR)</FieldLabel><Input id="costPaisa" name="costPaisa" inputMode="decimal" defaultValue={paisaToDecimalString(payload.costPaisa)} /></Field>
          <Field><FieldLabel htmlFor="pricePaisa">Selling price (PKR)</FieldLabel><Input id="pricePaisa" name="pricePaisa" inputMode="decimal" defaultValue={paisaToDecimalString(payload.suggestedPricePaisa)} /></Field>
          <Field><FieldLabel htmlFor="taxRateBps">Tax rate (%)</FieldLabel><Input id="taxRateBps" name="taxRateBps" type="number" step="0.01" min={0} max={100} defaultValue={payload.taxRateBps / 100} /></Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field><FieldLabel htmlFor="reorderLevel">Reorder level</FieldLabel><Input id="reorderLevel" name="reorderLevel" type="number" step="0.001" min={0} defaultValue={defaultReorderLevel} /></Field>
          <Field><FieldLabel htmlFor="reorderQty">Reorder qty</FieldLabel><Input id="reorderQty" name="reorderQty" type="number" step="0.001" min={0} defaultValue={0} /></Field>
          <Field orientation="horizontal"><Switch id="allowFractional" name="allowFractional" defaultChecked={payload.allowFractional} /><FieldLabel htmlFor="allowFractional">Sold in fractions</FieldLabel></Field>
        </div>
        <Field><FieldLabel htmlFor="description">Description</FieldLabel><Textarea id="description" name="description" defaultValue={payload.description ?? ""} rows={2} data-scanner-ignore /></Field>
        <Field><FieldLabel htmlFor="note">Review note (visible to the supplier)</FieldLabel><Input id="note" name="note" maxLength={500} data-scanner-ignore /></Field>
      </FieldGroup>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Approving…" : "Approve and create product"}</Button></div>
    </form>
  );
}

export function ApproveSupplyForm({ submissionId, lines }: { submissionId: string; lines: { name: string; batch: string; expiry: string }[] }) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(approveSupplySubmissionAction, { error: null });
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      <div className="grid gap-2 rounded-lg border p-3">
        <div className="text-sm font-medium">Batch and expiry to book</div>
        {lines.map((l, idx) => (
          <div key={idx} className="grid items-center gap-2 sm:grid-cols-[1fr_8rem_10rem]">
            <span className="truncate text-sm">{l.name}</span>
            <Input name={`batch_${idx}`} defaultValue={l.batch} placeholder="Batch" maxLength={60} aria-label={`Batch for ${l.name}`} data-scanner-ignore />
            <Input name={`expiry_${idx}`} type="date" defaultValue={l.expiry} aria-label={`Expiry for ${l.name}`} data-scanner-ignore />
          </div>
        ))}
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" name="allowExpired" /> Accept lots that are already expired</label>
      </div>
      <Field><FieldLabel htmlFor="supply-note">Review note (visible to the supplier)</FieldLabel><Input id="supply-note" name="note" maxLength={500} data-scanner-ignore /></Field>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Approving…" : "Approve and receive stock"}</Button></div>
    </form>
  );
}

export function RejectForm({ submissionId }: { submissionId: string }) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(rejectSubmissionAction, { error: null });
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="destructive" onClick={() => setOpen(true)}>Reject…</Button>;
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-destructive/40 p-4">
      <input type="hidden" name="submissionId" value={submissionId} />
      <Field><FieldLabel htmlFor="reject-note">Reason (sent to the supplier)</FieldLabel><Textarea id="reject-note" name="note" rows={2} required data-scanner-ignore /></Field>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div className="flex gap-2"><Button type="submit" variant="destructive" disabled={pending}>{pending ? "Rejecting…" : "Reject submission"}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </form>
  );
}
