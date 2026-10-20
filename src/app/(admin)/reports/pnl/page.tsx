import type { Metadata } from "next";
import { CategoryBarChart, TimeSeriesChart } from "@/components/reports/charts";
import { DateRangeControl } from "@/components/reports/date-range-control";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatPKR } from "@/lib/money";
import { pnlReport } from "@/lib/reports/pnl";
import type { SearchParams } from "@/lib/search-params";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Profit & loss" };

export default async function PnlPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { range, tz } = await reportContext(searchParams);
  const r = await pnlReport(range, tz);
  const k = r.kpis;
  const line = (label: string, value: number, opts: { bold?: boolean; negative?: boolean; indent?: boolean } = {}) => (
    <TableRow key={label} className={opts.bold ? "font-semibold" : ""}>
      <TableCell className={opts.indent ? "pl-8 text-muted-foreground" : ""}>{label}</TableCell>
      <TableCell className={`text-right tabular-nums ${opts.negative && value > 0 ? "text-destructive" : ""}`}>{opts.negative && value > 0 ? `−${formatPKR(value)}` : formatPKR(value)}</TableCell>
    </TableRow>
  );
  return (
    <div className="grid gap-6">
      <DateRangeControl range={range} basePath="/reports/pnl" exportPath="/api/reports/pnl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Net revenue (ex. tax)" value={formatPKR(k.netRevenuePaisa)} hint={`${k.orderCount} orders · gross ${formatPKR(k.grossSalesPaisa)}`} />
        <KpiCard label="Gross profit" value={formatPKR(k.grossProfitPaisa)} hint={`${(k.grossMarginBps / 100).toFixed(1)} % margin`} tone={k.grossProfitPaisa < 0 ? "negative" : undefined} />
        <KpiCard label="Expenses" value={formatPKR(k.expensesPaisa)} />
        <KpiCard label="Net profit" value={formatPKR(k.netProfitPaisa)} tone={k.netProfitPaisa < 0 ? "negative" : "positive"} />
      </div>
      <Card>
        <CardHeader><CardTitle>Daily revenue, cost of goods and expenses</CardTitle><CardDescription>Revenue excludes tax. Cost of goods uses the cost recorded on each sale line.</CardDescription></CardHeader>
        <CardContent><TimeSeriesChart data={r.byDay} series={[{ key: "revenuePaisa", label: "Revenue" }, { key: "cogsPaisa", label: "Cost of goods" }, { key: "expensesPaisa", label: "Expenses" }]} kind="bar" /></CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Statement</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {line("Gross sales (tax inclusive)", k.grossSalesPaisa)}
                {line("Tax collected", k.taxPaisa, { negative: true, indent: true })}
                {line("Net revenue", k.netRevenuePaisa, { bold: true })}
                {line("Cost of goods sold", k.cogsPaisa, { negative: true, indent: true })}
                {line("Gross profit", k.grossProfitPaisa, { bold: true })}
                {line("Operating expenses", k.expensesPaisa, { negative: true, indent: true })}
                {line("Net profit", k.netProfitPaisa, { bold: true })}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">Discounts given {formatPKR(k.discountPaisa)} · points redeemed {formatPKR(k.pointsValuePaisa)} · delivery fees {formatPKR(k.deliveryPaisa)} (included in gross sales).</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Expenses by category</CardTitle></CardHeader>
          <CardContent>{r.expensesByCategory.length ? <CategoryBarChart data={r.expensesByCategory.map((c) => ({ name: c.name, value: c.amountPaisa }))} nameKey="name" valueKey="value" label="Expenses" /> : <p className="text-sm text-muted-foreground">No expenses in this range.</p>}</CardContent>
        </Card>
      </div>
    </div>
  );
}
