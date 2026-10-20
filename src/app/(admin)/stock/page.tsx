import type { Metadata } from "next";
import { ClipboardListIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { listCategories, listSupplierOptions } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { STOCK_PAGE_SIZE, stockOverview } from "@/lib/stock/queries";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const params = { q: firstParam(raw.q) ?? "", category: firstParam(raw.category) ?? "", supplier: firstParam(raw.supplier) ?? "", low: firstParam(raw.low) === "1", page: Math.max(1, Number(firstParam(raw.page) ?? 1) || 1) };
  const [result, categories, suppliers] = await Promise.all([stockOverview({ ...params, category: params.category || undefined, supplier: params.supplier || undefined }), listCategories(), listSupplierOptions()]);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Stock</h1>
          <p className="text-sm text-muted-foreground">Levels, valuation at cost and low-stock alerts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/stock/movements" />}><ClipboardListIcon /> Movements</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/stock/take" />}>Stock take</Button>
          <Button nativeButton={false} render={<Link href="/stock/adjust" />}><SlidersHorizontalIcon /> Adjust stock</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card size="sm"><CardHeader><CardDescription>Stock value (at cost)</CardDescription><CardTitle className="tabular-nums">{formatPKR(result.summary.valuationPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Active products</CardDescription><CardTitle>{result.summary.activeCount}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Low stock</CardDescription><CardTitle className="text-destructive">{result.summary.lowCount}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Out of stock</CardDescription><CardTitle className="text-destructive">{result.summary.outCount}</CardTitle></CardHeader></Card>
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={params.q} placeholder="Search name, SKU or barcode" className="max-w-xs" data-scanner-ignore />
        <NativeSelect name="category" defaultValue={params.category}><NativeSelectOption value="">All categories</NativeSelectOption>{categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect>
        <NativeSelect name="supplier" defaultValue={params.supplier}><NativeSelectOption value="">All suppliers</NativeSelectOption>{suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}</NativeSelect>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={params.low} className="size-4 rounded border" /> Low stock only</label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reorder at</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No products match.</TableCell></TableRow> : null}
              {result.rows.map((p) => {
                const low = p.reorderLevel > 0 && p.stockQty <= p.reorderLevel;
                return (
                  <TableRow key={p.id}>
                    <TableCell><Link href={`/products/${p.id}/edit`} className="font-medium hover:underline">{p.name}</Link><div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell>
                    <TableCell>{p.categoryName ?? "—"}</TableCell>
                    <TableCell>{p.supplierName ?? "—"}</TableCell>
                    <TableCell className="text-right"><Badge variant={p.stockQty <= 0 ? "destructive" : low ? "outline" : "secondary"} className={low && p.stockQty > 0 ? "border-destructive text-destructive" : ""}>{formatQty(p.stockQty, p.unit)}</Badge></TableCell>
                    <TableCell className="text-right">{p.reorderLevel > 0 ? formatQty(p.reorderLevel) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPKR(Math.round(p.stockQty * p.costPaisa))}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/stock/adjust?product=${p.id}`} />}>Adjust</Button><Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/stock/movements?product=${p.id}`} />}>Ledger</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={STOCK_PAGE_SIZE} basePath="/stock" params={{ q: params.q, category: params.category, supplier: params.supplier, low: params.low ? "1" : undefined }} />
        </CardContent>
      </Card>
    </div>
  );
}
