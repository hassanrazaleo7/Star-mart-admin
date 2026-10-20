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
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_TYPES, type Customer } from "@/db/schema";
import type { CustomerLite } from "@/lib/customers/queries";
import { paisaToDecimalString } from "@/lib/money";
import { saveCustomerAction, type CustomerFormState } from "./actions";

type Props = { customer?: Customer | null; canSetCredit: boolean; trigger?: React.ReactElement; onCreated?: (customer: CustomerLite) => void };

export function CustomerFormDialog({ customer, canSetCredit, trigger, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CustomerFormState, FormData>(async (prev, fd) => {
    const result = await saveCustomerAction(prev, fd);
    if (!result.error) {
      toast.success(customer ? "Customer saved." : "Customer created.", { id: "customer-save" });
      setOpen(false);
      if (result.created) onCreated?.(result.created);
    }
    return result;
  }, { error: null });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button />}>{customer ? "Edit" : <><PlusIcon /> New customer</>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction} noValidate>
          <DialogHeader>
            <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
            <DialogDescription>Phone numbers must be unique; they are used to find the customer at the till.</DialogDescription>
          </DialogHeader>
          {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
          <FieldGroup className="py-4">
            <Field><FieldLabel htmlFor="cust-name">Name</FieldLabel><Input id="cust-name" name="name" defaultValue={customer?.name ?? ""} required maxLength={120} autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="cust-phone">Phone</FieldLabel><Input id="cust-phone" name="phone" inputMode="tel" defaultValue={customer?.phone ?? ""} data-scanner-ignore /></Field>
              <Field><FieldLabel htmlFor="cust-email">Email</FieldLabel><Input id="cust-email" name="email" type="email" defaultValue={customer?.email ?? ""} /></Field>
            </div>
            <Field><FieldLabel htmlFor="cust-address">Address</FieldLabel><Textarea id="cust-address" name="address" defaultValue={customer?.address ?? ""} rows={2} data-scanner-ignore /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="cust-type">Customer type</FieldLabel>
                <NativeSelect className="w-full" id="cust-type" name="type" defaultValue={customer?.type ?? "retail"}>
                  {CUSTOMER_TYPES.map((t) => <NativeSelectOption key={t} value={t}>{t}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              {canSetCredit ? (
                <Field>
                  <FieldLabel htmlFor="cust-credit">Credit limit (PKR)</FieldLabel>
                  <Input id="cust-credit" name="creditLimitPaisa" inputMode="decimal" defaultValue={customer ? paisaToDecimalString(customer.creditLimitPaisa) : "0.00"} />
                  <FieldDescription>0 means no credit sales allowed.</FieldDescription>
                </Field>
              ) : null}
            </div>
            <Field><FieldLabel htmlFor="cust-notes">Notes</FieldLabel><Textarea id="cust-notes" name="notes" defaultValue={customer?.notes ?? ""} rows={2} data-scanner-ignore /></Field>
            {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : customer ? "Save" : "Create customer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
