import type { Metadata } from "next";
import Link from "next/link";
import { TimeSeriesChart } from "@/components/reports/charts";
import { DateRangeControl } from "@/components/reports/date-range-control";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { purchasesReport } from "@/lib/reports/purchases";
import type { SearchParams } from "@/lib/search-params";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Purchases report" };

export default async function PurchasesReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { range, tz } = await reportContext(searchParams);
  const r = await purchasesReport(range, tz);
  return (
    <div className="grid gap-6">
      <DateRangeControl range={range} basePath="/reports/purchases" exportPath="/api/reports/purchases" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Purchased" value={formatPKR(r.kpis.purchasedPaisa)} hint={`${r.kpis.count} received purchase${r.kpis.count === 1 ? "" : "s"}`} />
        <KpiCard label="Paid" value={formatPKR(r.kpis.paidPaisa)} />
        <KpiCard label="Outstanding" value={formatPKR(r.kpis.outstandingPaisa)} tone={r.kpis.outstandingPaisa > 0 ? "negative" : undefined} />
        <KpiCard label="Suppliers" value={String(r.bySupplier.length)} />
      </div>
      <Card>
        <CardHeader><CardTitle>Purchases by day</CardTitle></CardHeader>
        <CardContent><TimeSeriesChart data={r.byDay} series={[{ key: "purchasedPaisa", label: "Purchased", color: "var(--chart-2)" }]} kind="bar" /></CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>By supplier</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Purchased</TableHead><TableHead className="text-right">Paid</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.bySupplier.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No purchases in this range.</TableCell></TableRow> : null}
                {r.bySupplier.map((s) => <TableRow key={s.supplierId}><TableCell><Link href={`/suppliers/${s.supplierId}`} className="font-medium hover:underline">{s.name}</Link></TableCell><TableCell className="text-right">{s.purchases}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(s.purchasedPaisa)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(s.paidPaisa)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Most purchased products</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.topProducts.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nothing received in this range.</TableCell></TableRow> : null}
                {r.topProducts.map((p) => <TableRow key={p.productId}><TableCell><Link href={`/products/${p.productId}/edit`} className="font-medium hover:underline">{p.name}</Link><div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell><TableCell className="text-right">{formatQty(p.qty)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(p.costPaisa)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
