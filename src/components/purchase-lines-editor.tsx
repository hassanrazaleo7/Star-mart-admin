"use client";

import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ProductSearch } from "@/components/product-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { ProductSearchRow } from "@/lib/products/queries";
import { formatPKR, lineTotal, paisaToDecimalString, parseMoneyInput } from "@/lib/money";

export type EditorLine = { productId: string; name: string; sku: string; unit: string; allowFractional: boolean; qty: number; unitCostPaisa: number; batch: string; expiry: string; tracksExpiry?: boolean; shelfLifeDays?: number | null };

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function suggestedExpiry(shelfLifeDays: number | null | undefined): string {
  if (!shelfLifeDays) return "";
  const d = new Date(`${localToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + shelfLifeDays);
  return d.toISOString().slice(0, 10);
}

type Props = {
  search: (query: string) => Promise<ProductSearchRow[]>;
  lookupBarcode?: (code: string) => Promise<ProductSearchRow | null>;
  name?: string;
  showBatch?: boolean;
  initial?: EditorLine[];
};

/** Line editor for purchases and supply submissions; serialises to a hidden JSON field. */
export function PurchaseLinesEditor({ search, lookupBarcode, name = "lines", showBatch = true, initial = [] }: Props) {
  const [lines, setLines] = useState<EditorLine[]>(initial);

  function add(p: ProductSearchRow) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        { productId: p.id, name: p.name, sku: p.sku, unit: p.unit, allowFractional: p.allowFractional, qty: 1, unitCostPaisa: p.costPaisa, batch: "", expiry: suggestedExpiry(p.shelfLifeDays), tracksExpiry: p.tracksExpiry, shelfLifeDays: p.shelfLifeDays },
      ];
    });
  }

  useBarcodeScanner(async (code) => {
    if (!lookupBarcode) return;
    const p = await lookupBarcode(code);
    if (p) add(p);
  });

  const update = (i: number, patch: Partial<EditorLine>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const subtotal = lines.reduce((s, l) => s + lineTotal(l.unitCostPaisa, l.qty), 0);
  const today = localToday();
  const payload = lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCostPaisa: l.unitCostPaisa, batch: l.batch || undefined, expiry: l.expiry || undefined }));

  return (
    <div className="grid gap-3">
      <input type="hidden" name={name} value={JSON.stringify(payload)} />
      <ProductSearch search={search} onPick={add} showStock placeholder="Add a product: name, SKU or scan a barcode" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="w-28">Qty</TableHead>
            <TableHead className="w-36">Unit cost (PKR)</TableHead>
            {showBatch ? <TableHead className="w-28">Batch</TableHead> : null}
            {showBatch ? <TableHead className="w-36">Expiry</TableHead> : null}
            <TableHead className="text-right">Line total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showBatch ? 7 : 5} className="text-center text-muted-foreground">
                No lines yet. Search above or scan a barcode.
              </TableCell>
            </TableRow>
          ) : null}
          {lines.map((l, i) => (
            <TableRow key={l.productId}>
              <TableCell>
                <div className="font-medium">{l.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{l.sku}</div>
                {showBatch && l.tracksExpiry ? <div className="text-xs text-muted-foreground">Tracks expiry{l.shelfLifeDays ? ` · shelf life ${l.shelfLifeDays} d` : ""}</div> : null}
              </TableCell>
              <TableCell>
                <Input type="number" min={0} step={l.allowFractional ? 0.001 : 1} value={l.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} data-scanner-ignore />
              </TableCell>
              <TableCell>
                <Input inputMode="decimal" defaultValue={paisaToDecimalString(l.unitCostPaisa)} onBlur={(e) => { try { update(i, { unitCostPaisa: parseMoneyInput(e.target.value || "0") }); } catch { e.target.value = paisaToDecimalString(l.unitCostPaisa); } }} data-scanner-ignore />
              </TableCell>
              {showBatch ? (
                <TableCell>
                  <Input value={l.batch} onChange={(e) => update(i, { batch: e.target.value })} data-scanner-ignore />
                </TableCell>
              ) : null}
              {showBatch ? (
                <TableCell>
                  <Input
                    type="date"
                    value={l.expiry}
                    onChange={(e) => update(i, { expiry: e.target.value })}
                    aria-invalid={(l.tracksExpiry && !l.expiry) || (!!l.expiry && l.expiry < today) || undefined}
                    title={l.tracksExpiry && !l.expiry ? "Expiry is required for this product" : l.expiry && l.expiry < today ? "This date is in the past" : undefined}
                    data-scanner-ignore
                  />
                </TableCell>
              ) : null}
              <TableCell className="text-right tabular-nums">{formatPKR(lineTotal(l.unitCostPaisa, l.qty))}</TableCell>
              <TableCell>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2Icon />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-end text-sm">
        <span className="text-muted-foreground">Subtotal&nbsp;</span>
        <span className="font-semibold tabular-nums">{formatPKR(subtotal)}</span>
      </div>
    </div>
  );
}
