import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBarChart, TimeSeriesChart } from "@/components/reports/charts";
import { DateRangeControl } from "@/components/reports/date-range-control";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { salesReport } from "@/lib/reports/sales";
import type { SearchParams } from "@/lib/search-params";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Sales report" };

export default async function SalesReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { range, tz } = await reportContext(searchParams);
  const r = await salesReport(range, tz);
  return (
    <div className="grid gap-6">
      <DateRangeControl range={range} basePath="/reports/sales" exportPath="/api/reports/sales" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Revenue" value={formatPKR(r.kpis.revenuePaisa)} hint={`${r.kpis.orderCount} completed order${r.kpis.orderCount === 1 ? "" : "s"}`} />
        <KpiCard label="Average order" value={formatPKR(r.kpis.avgOrderPaisa)} hint={`${formatQty(r.kpis.itemsSold)} items sold`} />
        <KpiCard label="Discounts + points" value={formatPKR(r.kpis.discountPaisa + r.kpis.pointsValuePaisa)} hint={`${formatPKR(r.kpis.discountPaisa)} codes · ${formatPKR(r.kpis.pointsValuePaisa)} points`} />
        <KpiCard label="Tax collected" value={formatPKR(r.kpis.taxPaisa)} hint={`Delivery fees ${formatPKR(r.kpis.deliveryPaisa)}`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Revenue by day</CardTitle><CardDescription>Completed orders by completion date.</CardDescription></CardHeader>
        <CardContent><TimeSeriesChart data={r.byDay} series={[{ key: "revenuePaisa", label: "Revenue" }]} /></CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>By channel</CardTitle></CardHeader>
          <CardContent>{r.byChannel.length ? <CategoryBarChart data={r.byChannel.map((c) => ({ name: c.channel.replace("_", "-"), value: c.revenuePaisa }))} nameKey="name" valueKey="value" label="Revenue" /> : <p className="text-sm text-muted-foreground">No sales in this range.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By payment method</CardTitle></CardHeader>
          <CardContent>{r.byMethod.length ? <CategoryBarChart data={r.byMethod.map((m) => ({ name: PAYMENT_METHOD_LABELS[m.method], value: m.amountPaisa }))} nameKey="name" valueKey="value" label="Collected" /> : <p className="text-sm text-muted-foreground">No payments in this range.</p>}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Top products</CardTitle><CardDescription>By revenue; profit uses the cost snapshot on each sale.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Gross profit</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.topProducts.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nothing sold in this range.</TableCell></TableRow> : null}
              {r.topProducts.map((p) => (
                <TableRow key={`${p.productId}-${p.sku}`}>
                  <TableCell>{p.productId ? <Link href={`/products/${p.productId}/edit`} className="font-medium hover:underline">{p.name}</Link> : p.name}<div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell>
                  <TableCell className="text-right">{formatQty(p.qty)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(p.revenuePaisa)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${p.profitPaisa < 0 ? "text-destructive" : ""}`}>{formatPKR(p.profitPaisa)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
