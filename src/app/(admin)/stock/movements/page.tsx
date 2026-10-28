import type { Metadata } from "next";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { stockMovementKindEnum } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime, formatQty } from "@/lib/format";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { listMovements, productBrief, STOCK_PAGE_SIZE } from "@/lib/stock/queries";

export const metadata: Metadata = { title: "Stock movements" };

const REF_LINKS: Record<string, (id: string) => string> = { purchase: (id) => `/purchases/${id}`, order: (id) => `/orders/${id}` };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const params = { product: firstParam(raw.product) ?? "", kind: firstParam(raw.kind) ?? "", from: firstParam(raw.from) ?? "", to: firstParam(raw.to) ?? "", page: Math.max(1, Number(firstParam(raw.page) ?? 1) || 1) };
  const productId = /^[0-9a-f-]{36}$/i.test(params.product) ? params.product : undefined;
  const [result, product] = await Promise.all([listMovements({ product: productId, kind: params.kind || undefined, from: params.from || undefined, to: params.to || undefined, page: params.page }), productId ? productBrief(productId) : null]);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Stock movements</h1>
          <p className="text-sm text-muted-foreground">{product ? `${product.name} (${product.sku}) · ${formatQty(product.stockQty, product.unit)} on hand` : "Every change to stock, with who made it."}</p>
        </div>
        {product ? <Button variant="outline" nativeButton={false} render={<Link href={`/stock/adjust?product=${product.id}`} />}>Adjust this product</Button> : null}
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2">
        {productId ? <input type="hidden" name="product" value={productId} /> : null}
        <NativeSelect name="kind" defaultValue={params.kind}><NativeSelectOption value="">All kinds</NativeSelectOption>{stockMovementKindEnum.enumValues.map((k) => <NativeSelectOption key={k} value={k}>{k.replace("_", " ")}</NativeSelectOption>)}</NativeSelect>
        <Input type="date" name="from" defaultValue={params.from} aria-label="From" />
        <Input type="date" name="to" defaultValue={params.to} aria-label="To" />
        <Button type="submit" variant="secondary">Filter</Button>
        {productId ? <Button variant="ghost" nativeButton={false} render={<Link href="/stock/movements" />}>All products</Button> : null}
      </form>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead>{!productId ? <TableHead>Product</TableHead> : null}<TableHead>Kind</TableHead><TableHead className="text-right">Change</TableHead>{productId ? <TableHead className="text-right">Balance</TableHead> : null}<TableHead>Reference</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No movements.</TableCell></TableRow> : null}
              {result.rows.map((m) => {
                const link = m.refType && m.refId && REF_LINKS[m.refType] ? REF_LINKS[m.refType](m.refId) : null;
                return (
                  <TableRow key={m.id}>
                    <TableCell>{formatDateTime(m.createdAt)}</TableCell>
                    {!productId ? <TableCell><Link href={`/stock/movements?product=${m.productId}`} className="font-medium hover:underline">{m.productName}</Link><div className="font-mono text-xs text-muted-foreground">{m.sku}</div></TableCell> : null}
                    <TableCell><Badge variant="outline">{m.kind.replace("_", " ")}</Badge>{m.reason ? <span className="ml-1 text-xs text-muted-foreground">{m.reason.replace("_", " ")}</span> : null}</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.qtyDelta < 0 ? "text-destructive" : "text-primary"}`}>{m.qtyDelta > 0 ? "+" : ""}{formatQty(m.qtyDelta, m.unit)}</TableCell>
                    {productId ? <TableCell className="text-right tabular-nums">{m.balance != null ? formatQty(m.balance, m.unit) : "—"}</TableCell> : null}
                    <TableCell>{link ? <Link href={link} className="hover:underline">{m.refType}</Link> : m.refType ?? "—"}{m.note ? <div className="text-xs text-muted-foreground">{m.note}</div> : null}</TableCell>
                    <TableCell>{m.actorName ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={STOCK_PAGE_SIZE} basePath="/stock/movements" params={{ product: productId, kind: params.kind, from: params.from, to: params.to }} />
        </CardContent>
      </Card>
    </div>
  );
}
