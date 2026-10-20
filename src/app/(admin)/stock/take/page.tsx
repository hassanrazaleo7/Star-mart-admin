import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { requireRole } from "@/lib/auth/session";
import { listCategories, listSupplierOptions } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { listCountSheet } from "@/lib/stock/queries";
import { CountSheet } from "./count-sheet";

export const metadata: Metadata = { title: "Stock take" };

export default async function StockTakePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const category = firstParam(raw.category) ?? "";
  const supplier = firstParam(raw.supplier) ?? "";
  const started = firstParam(raw.start) === "1";
  const [categories, suppliers] = await Promise.all([listCategories(), listSupplierOptions()]);
  const rows = started ? await listCountSheet({ category: category || undefined, supplier: supplier || undefined }) : [];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Stock take</h1>
        <p className="text-sm text-muted-foreground">Count products, review the differences, then commit them as count corrections.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Scope</CardTitle><CardDescription>Choose what to count (up to 1,000 products).</CardDescription></CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="start" value="1" />
            <NativeSelect name="category" defaultValue={category}><NativeSelectOption value="">All categories</NativeSelectOption>{categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect>
            <NativeSelect name="supplier" defaultValue={supplier}><NativeSelectOption value="">All suppliers</NativeSelectOption>{suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}</NativeSelect>
            <Button type="submit">Start counting</Button>
          </form>
        </CardContent>
      </Card>
      {started ? (
        <Card>
          <CardHeader><CardTitle>Count sheet</CardTitle><CardDescription>{rows.length} products. Leave a row blank to skip it.</CardDescription></CardHeader>
          <CardContent><CountSheet rows={rows} /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
