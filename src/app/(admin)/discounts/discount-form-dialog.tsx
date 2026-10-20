"use client";

import { PlusIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { DiscountCode } from "@/db/schema";
import { paisaToDecimalString } from "@/lib/money";
import { saveDiscountAction, type DiscountFormState } from "./actions";

function toLocalInput(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DiscountFormDialog({ discount, trigger }: { discount?: DiscountCode | null; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"percent" | "fixed">(discount?.kind ?? "percent");
  const [state, formAction, pending] = useActionState<DiscountFormState, FormData>(async (prev, fd) => {
    const r = await saveDiscountAction(prev, fd);
    if (r.ok) {
      toast.success("Discount code saved.", { id: "discount-save" });
      setOpen(false);
    }
    return r;
  }, { error: null });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button />}>{discount ? "Edit" : <><PlusIcon /> New code</>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction} noValidate>
          <DialogHeader>
            <DialogTitle>{discount ? `Edit ${discount.code}` : "New discount code"}</DialogTitle>
            <DialogDescription>Applied to the order subtotal before loyalty points and delivery.</DialogDescription>
          </DialogHeader>
          {discount ? <input type="hidden" name="id" value={discount.id} /> : null}
          <FieldGroup className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="dc-code">Code</FieldLabel><Input id="dc-code" name="code" defaultValue={discount?.code ?? ""} required className="font-mono uppercase" data-scanner-ignore /></Field>
              <Field>
                <FieldLabel htmlFor="dc-kind">Type</FieldLabel>
                <NativeSelect className="w-full" id="dc-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")}>
                  <NativeSelectOption value="percent">Percentage off</NativeSelectOption>
                  <NativeSelectOption value="fixed">Fixed amount off</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field><FieldLabel htmlFor="dc-value">{kind === "percent" ? "Percent (%)" : "Amount (PKR)"}</FieldLabel><Input id="dc-value" name="value" inputMode="decimal" defaultValue={discount ? (discount.kind === "percent" ? String(discount.value / 100) : paisaToDecimalString(discount.value)) : ""} required /></Field>
              <Field><FieldLabel htmlFor="dc-min">Min. order (PKR)</FieldLabel><Input id="dc-min" name="minOrderPaisa" inputMode="decimal" defaultValue={discount ? paisaToDecimalString(discount.minOrderPaisa) : "0.00"} /></Field>
              <Field><FieldLabel htmlFor="dc-max">Max. discount (PKR)</FieldLabel><Input id="dc-max" name="maxDiscountPaisa" inputMode="decimal" defaultValue={discount?.maxDiscountPaisa != null ? paisaToDecimalString(discount.maxDiscountPaisa) : ""} placeholder="no cap" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field><FieldLabel htmlFor="dc-start">Starts</FieldLabel><Input id="dc-start" name="startsAt" type="datetime-local" defaultValue={toLocalInput(discount?.startsAt ?? null)} /></Field>
              <Field><FieldLabel htmlFor="dc-end">Ends</FieldLabel><Input id="dc-end" name="endsAt" type="datetime-local" defaultValue={toLocalInput(discount?.endsAt ?? null)} /></Field>
              <Field><FieldLabel htmlFor="dc-limit">Usage limit</FieldLabel><Input id="dc-limit" name="usageLimit" type="number" min={1} defaultValue={discount?.usageLimit ?? ""} placeholder="unlimited" /><FieldDescription>{discount ? `Used ${discount.usedCount} time${discount.usedCount === 1 ? "" : "s"}.` : ""}</FieldDescription></Field>
            </div>
            {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save code"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
