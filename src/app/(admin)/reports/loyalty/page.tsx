import type { Metadata } from "next";
import Link from "next/link";
import { DateRangeControl } from "@/components/reports/date-range-control";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPKR } from "@/lib/money";
import { loyaltyReport } from "@/lib/reports/loyalty";
import type { SearchParams } from "@/lib/search-params";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Loyalty report" };

export default async function LoyaltyReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { range, tz } = await reportContext(searchParams);
  const r = await loyaltyReport(range, tz);
  return (
    <div className="grid gap-6">
      <DateRangeControl range={range} basePath="/reports/loyalty" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Points issued" value={r.kpis.earned.toLocaleString()} hint={`${r.kpis.transactions} transactions in range`} />
        <KpiCard label="Points redeemed" value={r.kpis.redeemed.toLocaleString()} hint={`Worth ${formatPKR(r.kpis.redeemed * r.kpis.redeemValuePaisa)}`} />
        <KpiCard label="Manual / reversed" value={`${r.kpis.adjusted >= 0 ? "+" : ""}${r.kpis.adjusted.toLocaleString()} / ${r.kpis.reversed.toLocaleString()}`} />
        <KpiCard label="Outstanding liability" value={formatPKR(r.kpis.liabilityPaisa)} hint={`${r.kpis.outstandingPoints.toLocaleString()} points across ${r.kpis.members} customers`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Top point balances</CardTitle><CardDescription>Customers most likely to redeem soon.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Points</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.topCustomers.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No customer holds points yet.</TableCell></TableRow> : null}
              {r.topCustomers.map((c) => <TableRow key={c.id}><TableCell><Link href={`/customers/${c.id}?tab=points`} className="font-medium hover:underline">{c.name}</Link></TableCell><TableCell>{c.phone ?? "—"}</TableCell><TableCell className="text-right">{c.pointsBalance.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(c.pointsBalance * r.kpis.redeemValuePaisa)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
