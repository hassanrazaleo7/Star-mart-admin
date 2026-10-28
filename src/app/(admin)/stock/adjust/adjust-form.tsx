"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ProductSearch } from "@/components/product-search";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STOCK_ADJUSTMENT_REASONS } from "@/db/schema";
import type { ProductSearchRow } from "@/lib/products/queries";
import { createStockAdjustmentAction, type StockFormState } from "../actions";

type Brief = { id: string; name: string; sku: string; unit: string; stockQty: number; allowFractional: boolean };

export function AdjustForm({ initialProduct, search }: { initialProduct: Brief | null; search: (q: string) => Promise<ProductSearchRow[]> }) {
  const [state, formAction, pending] = useActionState<StockFormState, FormData>(createStockAdjustmentAction, { error: null });
  const [product, setProduct] = useState<Brief | null>(initialProduct);
  const [direction, setDirection] = useState<"in" | "out">("out");

  return (
    <form action={formAction} noValidate className="grid max-w-xl gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel>Product</FieldLabel>
          {product ? (
            <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <div><div className="font-medium">{product.name}</div><div className="font-mono text-xs text-muted-foreground">{product.sku} · {product.stockQty} {product.unit} on hand</div></div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setProduct(null)}>Change</Button>
            </div>
          ) : (
            <ProductSearch search={search} onPick={(p) => setProduct({ id: p.id, name: p.name, sku: p.sku, unit: p.unit, stockQty: p.stockQty, allowFractional: p.allowFractional })} autoFocus />
          )}
          <input type="hidden" name="productId" value={product?.id ?? ""} />
        </Field>
        <Field>
          <FieldLabel>Direction</FieldLabel>
          <ToggleGroup value={[direction]} onValueChange={(v) => { const next = (Array.isArray(v) ? v[0] : v) as "in" | "out" | undefined; if (next) setDirection(next); }} aria-label="Direction">
            <ToggleGroupItem value="in">Stock in (+)</ToggleGroupItem>
            <ToggleGroupItem value="out">Stock out (−)</ToggleGroupItem>
          </ToggleGroup>
          <input type="hidden" name="direction" value={direction} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="qty">Quantity{product ? ` (${product.unit})` : ""}</FieldLabel>
            <Input id="qty" name="qty" type="number" min={0} step={product?.allowFractional ? 0.001 : 1} required data-scanner-ignore />
          </Field>
          <Field>
            <FieldLabel htmlFor="reason">Reason</FieldLabel>
            <NativeSelect className="w-full" id="reason" name="reason" defaultValue="count_correction">
              {STOCK_ADJUSTMENT_REASONS.map((r) => <NativeSelectOption key={r} value={r}>{r.replace("_", " ")}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="note">Note</FieldLabel>
          <Textarea id="note" name="note" rows={2} data-scanner-ignore />
          <FieldDescription>Recorded on the stock ledger with your name.</FieldDescription>
        </Field>
      </FieldGroup>
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !product}>{pending ? "Saving…" : "Record adjustment"}</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/stock" />}>Cancel</Button>
      </div>
    </form>
  );
}
