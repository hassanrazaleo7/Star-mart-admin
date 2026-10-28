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
import { getSettings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { expiryHint } from "@/lib/stock/expiry";
import { expirySummary, listBatches } from "@/lib/stock/expiry-queries";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Stock report" };

export default async function StockReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { tz } = await reportContext(searchParams);
  const settings = await getSettings();
  const today = storeToday(tz);
  const warningDays = settings.stock.expiryWarningDays;
  const [r, expiry, expired, soon] = await Promise.all([
    stockReport(),
    expirySummary(today, warningDays),
    listBatches({ view: "expired", today, warningDays, pageSize: 10 }),
    listBatches({ view: "soon", today, warningDays, pageSize: 10 }),
  ]);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Expiry</h2>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/api/reports/expiry" prefetch={false} />}><DownloadIcon /> Export batches CSV</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Expired in stock" value={formatPKR(expiry.expiredValuePaisa)} hint={`${expiry.expiredBatches} batches · ${expiry.productsExpired} products`} tone={expiry.expiredBatches ? "negative" : undefined} />
        <KpiCard label={`Expiring within ${warningDays} days`} value={formatPKR(expiry.soonValuePaisa)} hint={`${expiry.soonBatches} batches · ${expiry.productsSoon} products`} />
        <KpiCard label={`Written off (${expiry.writtenOffSinceDays} days)`} value={formatPKR(expiry.writtenOffValuePaisa)} hint={`${formatQty(expiry.writtenOffQty)} units`} />
        <KpiCard label="Perishable batches without a date" value={String(expiry.missingBatches)} tone={expiry.missingBatches ? "negative" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[{ title: "Expired, still in stock", rows: expired, empty: "Nothing expired.", view: "expired" }, { title: "Expiring soon", rows: soon, empty: `Nothing expires within ${warningDays} days.`, view: "soon" }].map((section) => (
          <Card key={section.view}>
            <CardHeader><CardTitle>{section.title}</CardTitle><CardDescription>{formatPKR(section.rows.totals.valuePaisa)} at cost · <Link href={`/stock/expiry?view=${section.view}`} className="underline">Manage on the Expiry page</Link></CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                <TableBody>
                  {section.rows.rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{section.empty}</TableCell></TableRow> : null}
                  {section.rows.rows.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell><Link href={`/products/${b.productId}/edit#batches`} className="font-medium hover:underline">{b.productName}</Link><div className="font-mono text-xs text-muted-foreground">{b.batchCode ?? b.sku}</div></TableCell>
                      <TableCell>{b.expiry}<div className="text-xs text-muted-foreground">{expiryHint(b.expiry, today)}</div></TableCell>
                      <TableCell className="text-right">{formatQty(b.qtyRemaining, b.unit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(Math.round(b.qtyRemaining * b.unitCostPaisa))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
