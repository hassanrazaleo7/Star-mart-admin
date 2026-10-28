import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { CategoryBarChart } from "@/components/reports/charts";
import { KpiCard } from "@/components/reports/kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLocalDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { stockReport } from "@/lib/reports/stock";
import type { SearchParams } from "@/lib/search-params";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Stock report" };

export default async function StockReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { tz } = await reportContext(searchParams);
  const r = await stockReport();
  return (
    <div className="grid gap-6">
      <div className="flex justify-end"><Button variant="outline" size="sm" nativeButton={false} render={<Link href="/api/reports/stock" prefetch={false} />}><DownloadIcon /> Export CSV</Button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Stock at cost" value={formatPKR(r.kpis.valuationPaisa)} hint={`${formatQty(r.kpis.units)} units · ${r.kpis.skus} SKUs`} />
        <KpiCard label="Stock at retail" value={formatPKR(r.kpis.retailValuePaisa)} hint={`Potential margin ${formatPKR(r.kpis.retailValuePaisa - r.kpis.valuationPaisa)}`} />
        <KpiCard label="Low stock" value={String(r.kpis.lowCount)} tone={r.kpis.lowCount ? "negative" : undefined} />
        <KpiCard label="Out of stock" value={String(r.kpis.outCount)} tone={r.kpis.outCount ? "negative" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Valuation by category</CardTitle></CardHeader>
          <CardContent>{r.byCategory.length ? <CategoryBarChart data={r.byCategory.map((c) => ({ name: c.category, value: c.valuationPaisa }))} nameKey="name" valueKey="value" label="At cost" /> : <p className="text-sm text-muted-foreground">No active products.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Low stock</CardTitle><CardDescription>At or below the reorder level. <Link href="/stock?low=1" className="underline">Open stock list</Link>.</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Reorder</TableHead><TableHead>Supplier</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.lowStock.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nothing is low on stock.</TableCell></TableRow> : null}
                {r.lowStock.map((p) => <TableRow key={p.id}><TableCell><Link href={`/products/${p.id}/edit`} className="font-medium hover:underline">{p.name}</Link><div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell><TableCell className={`text-right ${p.stockQty <= 0 ? "text-destructive" : ""}`}>{formatQty(p.stockQty, p.unit)}</TableCell><TableCell className="text-right">{formatQty(p.reorderLevel)} / +{formatQty(p.reorderQty)}</TableCell><TableCell>{p.supplierId ? <Link href={`/suppliers/${p.supplierId}`} className="hover:underline">{p.supplier}</Link> : "—"}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Dead stock</CardTitle><CardDescription>In stock but not sold in the last {r.deadDays} days, highest value first.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Value at cost</TableHead><TableHead>Last sold</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.deadStock.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Everything in stock has sold recently.</TableCell></TableRow> : null}
              {r.deadStock.map((p) => <TableRow key={p.id}><TableCell><Link href={`/products/${p.id}/edit`} className="font-medium hover:underline">{p.name}</Link><div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell><TableCell className="text-right">{formatQty(p.stockQty, p.unit)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(p.valuePaisa)}</TableCell><TableCell>{p.lastSale ? formatLocalDateTime(p.lastSale, tz) : "Never"}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
