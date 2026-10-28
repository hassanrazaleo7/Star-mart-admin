"use client";

import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updateBatchAction, writeOffBatchesAction, type StockFormState } from "@/app/(admin)/stock/actions";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { EXPIRY_STATUS_LABEL, expiryBadgeVariant, expiryHint, expiryStatus } from "@/lib/stock/expiry";

export type BatchTableRow = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  tracksExpiry: boolean;
  expiryWarningDays: number | null;
  batchCode: string | null;
  expiry: string | null;
  source: string;
  receivedQty: number;
  qtyRemaining: number;
  unitCostPaisa: number;
  supplierName: string | null;
  purchaseId: string | null;
  purchaseNumber: string | null;
  writtenOffAt: Date | null;
};

type Props = {
  rows: BatchTableRow[];
  today: string;
  warningDays: number;
  /** Hide the product column (the table sits on a product page). */
  hideProduct?: boolean;
  canManage: boolean;
  redirectTo: string;
  emptyText?: string;
};

const SOURCE_LABEL: Record<string, string> = { purchase: "Purchase", adjustment: "Adjustment", stock_take: "Stock take", sale_return: "Returned sale", initial: "Opening stock", opening: "Opening (pre-batch)" };

export function BatchTable({ rows, today, warningDays, hideProduct, canManage, redirectTo, emptyText = "No batches." }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<StockFormState, FormData>(writeOffBatchesAction, { error: null });
  const open = rows.filter((r) => r.qtyRemaining > 0);
  const selectedValue = rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + Math.round(r.qtyRemaining * r.unitCostPaisa), 0);
  const toggle = (id: string, on: boolean) => setSelected((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const allOn = open.length > 0 && open.every((r) => selected.has(r.id));

  return (
    <div className="grid gap-3">
      {canManage ? (
        <form action={formAction} id="batch-writeoff" className="flex flex-wrap items-center gap-2" onSubmit={(e) => { if (!confirm(`Write off ${selected.size} batch(es), ${formatPKR(selectedValue)} at cost? This removes the units from stock.`)) e.preventDefault(); }}>
          {[...selected].map((id) => <input key={id} type="hidden" name="batchId" value={id} />)}
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <Input name="note" placeholder="Note (optional)" maxLength={500} className="max-w-xs" data-scanner-ignore />
          <Button type="submit" variant="destructive" disabled={pending || selected.size === 0}>
            {pending ? "Writing off…" : `Write off selected${selected.size ? ` (${selected.size} · ${formatPKR(selectedValue)})` : ""}`}
          </Button>
          {state.error ? <Alert variant="destructive" className="w-full"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        </form>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            {canManage ? (
              <TableHead className="w-8">
                <input type="checkbox" aria-label="Select all open batches" className="size-4" checked={allOn} onChange={(e) => setSelected(e.target.checked ? new Set(open.map((r) => r.id)) : new Set())} />
              </TableHead>
            ) : null}
            {hideProduct ? null : <TableHead>Product</TableHead>}
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="text-right">Value</TableHead>
            {canManage ? <TableHead className="w-10" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">{emptyText}</TableCell></TableRow>
          ) : null}
          {rows.map((r) => {
            const status = expiryStatus(r.expiry, today, r.expiryWarningDays ?? warningDays);
            const missing = !r.expiry && r.tracksExpiry && r.qtyRemaining > 0;
            return (
              <TableRow key={r.id} className={r.qtyRemaining <= 0 ? "text-muted-foreground" : undefined}>
                {canManage ? (
                  <TableCell>
                    <input type="checkbox" aria-label={`Select batch ${r.batchCode ?? r.id.slice(0, 8)}`} className="size-4" disabled={r.qtyRemaining <= 0} checked={selected.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
                  </TableCell>
                ) : null}
                {hideProduct ? null : (
                  <TableCell>
                    <Link href={`/products/${r.productId}/edit#batches`} className="font-medium hover:underline">{r.productName}</Link>
                    <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="font-mono text-sm">{r.batchCode ?? "—"}</div>
                  {r.supplierName ? <div className="text-xs text-muted-foreground">{r.supplierName}</div> : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tabular-nums">{r.expiry ?? "—"}</span>
                    {r.qtyRemaining > 0 && status !== "fresh" && status !== "none" ? <Badge variant={expiryBadgeVariant(status)}>{EXPIRY_STATUS_LABEL[status]}</Badge> : null}
                    {missing ? <Badge variant="outline" className="border-destructive text-destructive">Missing expiry</Badge> : null}
                    {r.writtenOffAt && r.qtyRemaining <= 0 ? <Badge variant="secondary">Written off</Badge> : null}
                  </div>
                  {r.expiry && r.qtyRemaining > 0 ? <div className="text-xs text-muted-foreground">{expiryHint(r.expiry, today)}</div> : null}
                </TableCell>
                <TableCell>
                  {r.purchaseId ? <Link href={`/purchases/${r.purchaseId}`} className="hover:underline">{r.purchaseNumber}</Link> : (SOURCE_LABEL[r.source] ?? r.source)}
                </TableCell>
                <TableCell className="text-right">{formatQty(r.receivedQty, r.unit)}</TableCell>
                <TableCell className="text-right font-medium">{formatQty(r.qtyRemaining, r.unit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(Math.round(r.qtyRemaining * r.unitCostPaisa))}</TableCell>
                {canManage ? <TableCell><EditBatchDialog row={r} /></TableCell> : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EditBatchDialog({ row }: { row: BatchTableRow }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<StockFormState, FormData>(async (prev, fd) => {
    const result = await updateBatchAction(prev, fd);
    if (!result.error) {
      toast.success("Batch updated.", { id: "batch-updated" });
      setOpen(false);
    }
    return result;
  }, { error: null });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Edit batch" />}><PencilIcon /></DialogTrigger>
      <DialogContent>
        <form action={formAction} noValidate>
          <DialogHeader>
            <DialogTitle>Edit batch</DialogTitle>
            <DialogDescription>{row.productName}: correct the lot code or expiry date. Quantities change only through stock movements.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="batchId" value={row.id} />
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor={`batch-code-${row.id}`}>Batch / lot code</FieldLabel>
              <Input id={`batch-code-${row.id}`} name="batchCode" defaultValue={row.batchCode ?? ""} maxLength={60} data-scanner-ignore />
            </Field>
            <Field>
              <FieldLabel htmlFor={`batch-expiry-${row.id}`}>Expiry date</FieldLabel>
              <Input id={`batch-expiry-${row.id}`} name="expiry" type="date" defaultValue={row.expiry ?? ""} />
              <FieldDescription>Last day the units may be sold. Leave empty if they do not expire.</FieldDescription>
            </Field>
          </FieldGroup>
          {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
