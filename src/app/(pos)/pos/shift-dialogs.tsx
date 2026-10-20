"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPKR, parseMoneyInput } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import type { ShiftSummary } from "@/lib/shifts/queries";
import type { CloseShiftResult, ShiftActionResult } from "./actions";

export type ShiftInfo = { id: string; number: string; openedAt: string; openingFloatPaisa: number; reopened: boolean };

export function OpenShiftDialog({ open, onOpened, openShift }: { open: boolean; onOpened: (shift: ShiftInfo) => void; openShift: (input: unknown) => Promise<ShiftActionResult> }) {
  const [float, setFloat] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      let openingFloatPaisa: number;
      try {
        openingFloatPaisa = parseMoneyInput(float || "0");
      } catch {
        setError("Enter the opening float like 2000.00");
        return;
      }
      const r = await openShift({ openingFloatPaisa: float || "0", notes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`Shift ${r.number} opened`, { id: "shift" });
      onOpened({ id: r.shiftId, number: r.number, openedAt: new Date().toISOString(), openingFloatPaisa, reopened: false });
    });
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}>
        <DialogHeader><DialogTitle>Open your shift</DialogTitle><DialogDescription>Count the cash in the drawer before the first sale. Sales are blocked until a shift is open.</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="shift-float">Opening float (PKR)</FieldLabel><Input id="shift-float" inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} autoFocus onFocus={(e) => e.target.select()} data-scanner-ignore /></Field>
        <Field><FieldLabel htmlFor="shift-notes">Notes</FieldLabel><Textarea id="shift-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-scanner-ignore /></Field>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter><Button type="button" onClick={submit} disabled={pending}>{pending ? "Opening…" : "Open shift"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SummaryResult = { ok: true; summary: ShiftSummary; number: string; openingFloatPaisa: number } | { ok: false; error: string };

export function CloseShiftDialog({ open, onOpenChange, shift, loadSummary, closeShift }: { open: boolean; onOpenChange: (o: boolean) => void; shift: ShiftInfo; loadSummary: (id: string) => Promise<SummaryResult>; closeShift: (input: unknown) => Promise<CloseShiftResult> }) {
  const router = useRouter();
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadSummary(shift.id).then((r) => {
      if (cancelled) return;
      if (r.ok) setSummary(r.summary);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, shift.id, loadSummary]);

  let countedPaisa: number | null = null;
  try {
    countedPaisa = counted.trim() ? parseMoneyInput(counted) : null;
  } catch {
    countedPaisa = null;
  }
  const variance = summary && countedPaisa != null ? countedPaisa - summary.expectedCashPaisa : null;
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await closeShift({ shiftId: shift.id, countedCashPaisa: counted, notes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`Shift ${r.number} closed`, { id: "shift" });
      onOpenChange(false);
      router.push(`/shifts/${r.shiftId}?status=shift_closed`);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Close shift {shift.number}</DialogTitle><DialogDescription>Count the cash in the drawer. The expected amount includes the opening float.</DialogDescription></DialogHeader>
        {summary ? (
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-3" data-testid="shift-summary">
              <span className="text-muted-foreground">Sales</span><span className="text-right tabular-nums">{summary.salesCount} ({formatPKR(summary.grossPaisa)})</span>
              {(["cash", "card", "bank_transfer", "credit"] as const).map((m) => (
                <span key={m} className="contents"><span className="text-muted-foreground">{PAYMENT_METHOD_LABELS[m]}</span><span className="text-right tabular-nums">{formatPKR(summary.byMethod[m].receivedPaisa)}{summary.byMethod[m].refundedPaisa ? ` (−${formatPKR(summary.byMethod[m].refundedPaisa)} refunded)` : ""}</span></span>
              ))}
              <span className="text-muted-foreground">Opening float</span><span className="text-right tabular-nums">{formatPKR(shift.openingFloatPaisa)}</span>
              <span className="font-semibold">Expected cash in drawer</span><span className="text-right font-semibold tabular-nums" data-testid="shift-expected">{formatPKR(summary.expectedCashPaisa)}</span>
            </div>
            <Field><FieldLabel htmlFor="shift-counted">Counted cash (PKR)</FieldLabel><Input id="shift-counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus placeholder={(summary.expectedCashPaisa / 100).toFixed(2)} data-scanner-ignore onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
              <FieldDescription>{variance == null ? "Enter the amount counted." : variance === 0 ? "Drawer balances." : <span className={variance < 0 ? "text-destructive" : ""}>Variance {variance > 0 ? "+" : "−"}{formatPKR(Math.abs(variance))} ({variance < 0 ? "short" : "over"})</span>}</FieldDescription>
            </Field>
            <Field><FieldLabel htmlFor="shift-close-notes">Notes</FieldLabel><Textarea id="shift-close-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-scanner-ignore /></Field>
          </div>
        ) : error ? null : <p className="text-sm text-muted-foreground">Loading totals…</p>}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button type="button" onClick={submit} disabled={pending || !summary || countedPaisa == null}>{pending ? "Closing…" : "Close shift"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
