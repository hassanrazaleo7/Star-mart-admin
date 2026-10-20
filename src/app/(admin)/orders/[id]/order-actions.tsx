"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatus, PaymentMethod } from "@/db/schema";
import { formatPKR, paisaToDecimalString } from "@/lib/money";
import { ORDER_STATUS_LABELS, ORDER_TRANSITIONS, PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { cancelOrderAction, recordPaymentAction, transitionOrderAction, type OrderFormState, type PaymentFormState } from "../actions";

type OrderSummary = { id: string; status: OrderStatus; fulfillment: "pickup" | "delivery"; paymentStatus: "unpaid" | "partial" | "paid" | "refunded"; totalPaisa: number; paidPaisa: number; customer: { creditLimitPaisa: number; creditBalancePaisa: number } | null };

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { confirmed: "Confirm order", ready: "Mark ready", out_for_delivery: "Out for delivery", completed: "Complete order" };

export function StatusActions({ order, canCancel }: { order: OrderSummary; canCancel: boolean }) {
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(transitionOrderAction, { error: null });
  const next = ORDER_TRANSITIONS[order.status].filter((s) => s !== "cancelled" && (s !== "out_for_delivery" || order.fulfillment === "delivery"));
  const due = order.totalPaisa - order.paidPaisa;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {next.map((to) => {
          const blocked = to === "completed" && order.paymentStatus !== "paid";
          return (
            <Dialog key={to}>
              <DialogTrigger render={<Button variant={to === "completed" ? "default" : "outline"} disabled={blocked} />}>{NEXT_LABEL[to] ?? ORDER_STATUS_LABELS[to]}</DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <form action={formAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="to" value={to} />
                  <DialogHeader>
                    <DialogTitle>{NEXT_LABEL[to] ?? ORDER_STATUS_LABELS[to]}?</DialogTitle>
                    <DialogDescription>
                      {to === "confirmed" ? "Stock is deducted now and an invoice is issued." : to === "completed" ? "Loyalty points are credited and the invoice is marked paid." : `The order will be marked ${ORDER_STATUS_LABELS[to].toLowerCase()}.`}
                    </DialogDescription>
                  </DialogHeader>
                  <Field className="py-4"><FieldLabel htmlFor={`note-${to}`}>Note (optional)</FieldLabel><Input id={`note-${to}`} name="note" maxLength={300} data-scanner-ignore /></Field>
                  {state.error ? <Alert variant="destructive" className="mb-3"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Back</DialogClose>
                    <Button type="submit" disabled={pending}>{pending ? "Working…" : "Confirm"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          );
        })}
        {canCancel && order.status !== "cancelled" ? <CancelOrderDialog order={order} /> : null}
      </div>
      {order.status !== "cancelled" && due > 0 && next.includes("completed") ? <p className="text-xs text-muted-foreground">{formatPKR(due)} still due; record payment before completing.</p> : null}
    </div>
  );
}

function CancelOrderDialog({ order }: { order: OrderSummary }) {
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(cancelOrderAction, { error: null });
  const refundable = order.paidPaisa;
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" />}>Cancel order</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form action={formAction} noValidate>
          <input type="hidden" name="orderId" value={order.id} />
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>{order.status === "completed" ? "Returned stock goes back on the shelf, earned points are reversed and payments are refunded." : "Reserved stock, redeemed points and discount usage are released."}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field><FieldLabel htmlFor="cancel-reason">Reason</FieldLabel><Textarea id="cancel-reason" name="reason" rows={2} required minLength={3} maxLength={300} data-scanner-ignore /></Field>
            {refundable > 0 ? (
              <Field>
                <FieldLabel htmlFor="cancel-refund">Refund {formatPKR(refundable)} by</FieldLabel>
                <NativeSelect className="w-full" id="cancel-refund" name="refundMethod" defaultValue="cash"><NativeSelectOption value="cash">Cash</NativeSelectOption><NativeSelectOption value="card">Card</NativeSelectOption><NativeSelectOption value="bank_transfer">Bank transfer</NativeSelectOption></NativeSelect>
                <FieldDescription>Credit purchases are reversed on the customer account automatically.</FieldDescription>
              </Field>
            ) : null}
            {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep order</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>{pending ? "Cancelling…" : "Cancel order"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordPaymentDialog({ order }: { order: OrderSummary }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const due = order.totalPaisa - order.paidPaisa;
  const creditAvailable = order.customer ? Math.max(0, order.customer.creditLimitPaisa - order.customer.creditBalancePaisa) : 0;
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(async (prev, fd) => {
    const r = await recordPaymentAction(prev, fd);
    if (r.ok) {
      toast.success(r.changePaisa ? `Payment recorded. Change: ${formatPKR(r.changePaisa)}` : "Payment recorded.", { id: "order-payment" });
      setOpen(false);
    }
    return r;
  }, { error: null });
  if (due <= 0 || order.status === "cancelled") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Record payment</DialogTrigger>
      <DialogContent>
        <form action={formAction} noValidate>
          <input type="hidden" name="orderId" value={order.id} />
          <DialogHeader><DialogTitle>Record payment</DialogTitle><DialogDescription>{formatPKR(due)} is due on this order.</DialogDescription></DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="pay-method">Method</FieldLabel>
                <NativeSelect className="w-full" id="pay-method" name="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {(["cash", "card", "bank_transfer", "credit"] as const).map((m) => <NativeSelectOption key={m} value={m} disabled={m === "credit" && !order.customer}>{PAYMENT_METHOD_LABELS[m]}</NativeSelectOption>)}
                </NativeSelect>
                {method === "credit" ? <FieldDescription>{order.customer ? `${formatPKR(creditAvailable)} credit available.` : "Needs a customer account."}</FieldDescription> : null}
              </Field>
              <Field><FieldLabel htmlFor="pay-amount">Amount applied (PKR)</FieldLabel><Input id="pay-amount" name="amount" inputMode="decimal" defaultValue={paisaToDecimalString(due)} required data-scanner-ignore /></Field>
            </div>
            {method === "cash" ? <Field><FieldLabel htmlFor="pay-received">Cash received (PKR)</FieldLabel><Input id="pay-received" name="received" inputMode="decimal" placeholder={paisaToDecimalString(due)} data-scanner-ignore /><FieldDescription>Leave empty when exact; change is computed from the amount received.</FieldDescription></Field> : null}
            {method !== "cash" ? <Field><FieldLabel htmlFor="pay-reference">Reference</FieldLabel><Input id="pay-reference" name="reference" maxLength={100} placeholder="Card slip / transaction id" data-scanner-ignore /></Field> : null}
            <Field><FieldLabel htmlFor="pay-note">Note</FieldLabel><Input id="pay-note" name="note" maxLength={300} data-scanner-ignore /></Field>
            {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
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
