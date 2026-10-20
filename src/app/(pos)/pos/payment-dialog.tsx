"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { PaymentMethod } from "@/db/schema";
import type { CustomerLite } from "@/lib/customers/queries";
import { formatPKR, paisaToDecimalString, parseMoneyInput } from "@/lib/money";
import { settlePayments } from "@/lib/orders/pricing";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";

export type PaymentEntry = { id: string; method: PaymentMethod; amountPaisa: number; reference: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalPaisa: number;
  customer: CustomerLite | null;
  busy: boolean;
  error: string | null;
  onComplete: (payments: { method: PaymentMethod; amountPaisa: number; reference: string | null }[]) => void;
};

const QUICK = [50000, 100000, 500000];
const newEntry = (method: PaymentMethod, amountPaisa: number): PaymentEntry => ({ id: crypto.randomUUID(), method, amountPaisa, reference: "" });

export function PaymentDialog({ open, onOpenChange, totalPaisa, customer, busy, error, onComplete }: Props) {
  // The parent remounts this dialog (key) each time it opens, so a single cash
  // line for the full amount is the fresh initial state.
  const [entries, setEntries] = useState<PaymentEntry[]>(() => [newEntry("cash", totalPaisa)]);

  const settled = settlePayments(totalPaisa, entries);
  const creditAvailable = customer ? Math.max(0, customer.creditLimitPaisa - customer.creditBalancePaisa) : 0;
  const creditUsed = entries.filter((e) => e.method === "credit").reduce((s, e) => s + e.amountPaisa, 0);
  const problems: string[] = [];
  if (settled.remainingPaisa > 0) problems.push(`${formatPKR(settled.remainingPaisa)} still to collect.`);
  if (settled.applied.some((p) => p.overpaid)) problems.push("Card, bank and credit amounts cannot exceed the balance due.");
  if (creditUsed > 0 && !customer) problems.push("Credit needs a customer account.");
  if (creditUsed > creditAvailable) problems.push(`Only ${formatPKR(creditAvailable)} credit available.`);
  const canComplete = problems.length === 0 && entries.length > 0 && !busy;

  const update = (id: string, patch: Partial<PaymentEntry>) => setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const cashEntry = entries.find((e) => e.method === "cash");
  const setCash = (paisa: number) => {
    if (cashEntry) update(cashEntry.id, { amountPaisa: paisa });
    else setEntries((prev) => [...prev, newEntry("cash", paisa)]);
  };
  const submit = () => {
    if (!canComplete) return;
    onComplete(entries.map((e) => ({ method: e.method, amountPaisa: e.amountPaisa, reference: e.reference.trim() || null })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}>
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
          <DialogDescription>Total due <span className="font-semibold text-foreground tabular-nums">{formatPKR(totalPaisa)}</span>. Split across methods if needed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCash(settled.remainingPaisa + (cashEntry?.amountPaisa ?? 0))}>Exact</Button>
            {QUICK.map((q) => <Button key={q} type="button" variant="outline" size="sm" onClick={() => setCash(q)}>{formatPKR(q, { compact: true })}</Button>)}
          </div>
          {entries.map((e) => (
            <div key={e.id} className="grid grid-cols-[9rem_1fr_1fr_auto] items-center gap-2">
              <NativeSelect value={e.method} aria-label="Payment method" onChange={(ev) => update(e.id, { method: ev.target.value as PaymentMethod })}>
                {(["cash", "card", "bank_transfer", "credit"] as const).map((m) => <NativeSelectOption key={m} value={m} disabled={m === "credit" && !customer}>{PAYMENT_METHOD_LABELS[m]}</NativeSelectOption>)}
              </NativeSelect>
              <Input key={`${e.id}-${e.amountPaisa}`} inputMode="decimal" aria-label="Amount" defaultValue={paisaToDecimalString(e.amountPaisa)} data-scanner-ignore autoFocus={entries.length === 1} onFocus={(ev) => ev.target.select()} onBlur={(ev) => { try { update(e.id, { amountPaisa: parseMoneyInput(ev.target.value || "0") }); } catch { ev.target.value = paisaToDecimalString(e.amountPaisa); } }} />
              <Input placeholder={e.method === "cash" ? "" : "Reference"} aria-label="Reference" value={e.reference} disabled={e.method === "cash"} onChange={(ev) => update(e.id, { reference: ev.target.value })} data-scanner-ignore />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove payment line" disabled={entries.length === 1} onClick={() => setEntries((prev) => prev.filter((x) => x.id !== e.id))}><Trash2Icon /></Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEntries((prev) => [...prev, newEntry("card", Math.max(0, settled.remainingPaisa))])}><PlusIcon /> Split payment</Button>
            {customer ? <span className="text-xs text-muted-foreground">Credit available {formatPKR(creditAvailable)}</span> : null}
          </div>
          <div className="grid gap-1 rounded-lg border p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Tendered</span><span className="tabular-nums">{formatPKR(settled.applied.reduce((s, p) => s + p.tenderedPaisa, 0))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className={`tabular-nums ${settled.remainingPaisa > 0 ? "text-destructive" : ""}`}>{formatPKR(settled.remainingPaisa)}</span></div>
            <div className="flex justify-between text-base font-semibold"><span>Change</span><span className="tabular-nums" data-testid="pos-change">{formatPKR(settled.changePaisa)}</span></div>
          </div>
          {problems.map((p) => <p key={p} className="text-xs text-destructive">{p}</p>)}
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button type="button" disabled={!canComplete} onClick={submit}>{busy ? "Completing…" : "Complete sale"} <Kbd>Ctrl+⏎</Kbd></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
