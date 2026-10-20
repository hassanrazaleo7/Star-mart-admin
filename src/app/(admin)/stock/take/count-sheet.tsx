"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { commitStockTakeAction, type StockFormState } from "../actions";

type Row = { id: string; name: string; sku: string; unit: string; stockQty: number; allowFractional: boolean };

export function CountSheet({ rows }: { rows: Row[] }) {
  const [state, formAction, pending] = useActionState<StockFormState, FormData>(commitStockTakeAction, { error: null });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const entries = rows
    .filter((r) => counts[r.id] !== undefined && counts[r.id] !== "")
    .map((r) => ({ productId: r.id, countedQty: Number(counts[r.id]), delta: Math.round((Number(counts[r.id]) - r.stockQty) * 1000) / 1000, row: r }));
  const changed = entries.filter((e) => e.delta !== 0);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="entries" value={JSON.stringify(entries.map((e) => ({ productId: e.productId, countedQty: e.countedQty })))} />
      <Table>
        <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">System</TableHead><TableHead className="w-40">Counted</TableHead><TableHead className="text-right">Difference</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => {
            const counted = counts[r.id];
            const delta = counted !== undefined && counted !== "" ? Math.round((Number(counted) - r.stockQty) * 1000) / 1000 : null;
            return (
              <TableRow key={r.id}>
                <TableCell><div className="font-medium">{r.name}</div><div className="font-mono text-xs text-muted-foreground">{r.sku}</div></TableCell>
                <TableCell className="text-right tabular-nums">{r.stockQty} {r.unit}</TableCell>
                <TableCell><Input type="number" min={0} step={r.allowFractional ? 0.001 : 1} value={counted ?? ""} placeholder="—" onChange={(e) => setCounts((c) => ({ ...c, [r.id]: e.target.value }))} data-scanner-ignore /></TableCell>
                <TableCell className="text-right tabular-nums">{delta === null ? "" : <Badge variant={delta === 0 ? "outline" : delta < 0 ? "destructive" : "default"}>{delta > 0 ? "+" : ""}{delta}</Badge>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="grid max-w-xl gap-2">
        <label htmlFor="take-note" className="text-sm font-medium">Note</label>
        <Textarea id="take-note" name="note" rows={2} placeholder="e.g. Monthly count, aisle 3" data-scanner-ignore />
      </div>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      {!preview ? (
        <div><Button type="button" onClick={() => setPreview(true)} disabled={entries.length === 0}>Preview {changed.length} change{changed.length === 1 ? "" : "s"}</Button></div>
      ) : (
        <div className="grid gap-3 rounded-lg border p-4">
          <p className="text-sm">{changed.length} product{changed.length === 1 ? "" : "s"} will be corrected; {entries.length - changed.length} already match.</p>
          <ul className="grid gap-1 text-sm">
            {changed.map((e) => <li key={e.productId}>{e.row.name}: {e.row.stockQty} → {e.countedQty} {e.row.unit} ({e.delta > 0 ? "+" : ""}{e.delta})</li>)}
          </ul>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || changed.length === 0}>{pending ? "Committing…" : "Commit stock take"}</Button>
            <Button type="button" variant="ghost" onClick={() => setPreview(false)}>Back</Button>
          </div>
        </div>
      )}
    </form>
  );
}
