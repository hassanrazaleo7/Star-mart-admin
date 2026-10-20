import type { Metadata } from "next";
import { CategoryBarChart, TimeSeriesChart } from "@/components/reports/charts";
import { DateRangeControl } from "@/components/reports/date-range-control";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPKR } from "@/lib/money";
import { expensesReport } from "@/lib/reports/expenses";
import type { SearchParams } from "@/lib/search-params";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Expenses report" };

export default async function ExpensesReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { range } = await reportContext(searchParams);
  const r = await expensesReport(range);
  return (
    <div className="grid gap-6">
      <DateRangeControl range={range} basePath="/reports/expenses" exportPath="/api/reports/expenses" />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total expenses" value={formatPKR(r.kpis.totalPaisa)} hint={`${r.kpis.count} entries`} />
        <KpiCard label="Per day" value={formatPKR(r.kpis.avgPerDayPaisa)} />
        <KpiCard label="Categories" value={String(r.byCategory.length)} />
      </div>
      <Card>
        <CardHeader><CardTitle>Expenses by day</CardTitle></CardHeader>
        <CardContent><TimeSeriesChart data={r.byDay} series={[{ key: "amountPaisa", label: "Expenses", color: "var(--chart-3)" }]} kind="bar" /></CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>By category</CardTitle></CardHeader><CardContent>{r.byCategory.length ? <CategoryBarChart data={r.byCategory.map((c) => ({ name: c.name, value: c.amountPaisa }))} nameKey="name" valueKey="value" label="Amount" /> : <p className="text-sm text-muted-foreground">No expenses in this range.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>By payment method</CardTitle></CardHeader><CardContent>{r.byMethod.length ? <CategoryBarChart data={r.byMethod.map((m) => ({ name: m.method.replace("_", " "), value: m.amountPaisa }))} nameKey="name" valueKey="value" label="Amount" /> : <p className="text-sm text-muted-foreground">No expenses in this range.</p>}</CardContent></Card>
      </div>
    </div>
  );
}
