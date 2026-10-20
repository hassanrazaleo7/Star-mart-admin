import type { Metadata } from "next";
import Link from "next/link";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPKR } from "@/lib/money";
import { balancesReport } from "@/lib/reports/balances";
import type { SearchParams } from "@/lib/search-params";
import { reportContext } from "../_shared";

export const metadata: Metadata = { title: "Balances report" };

export default async function BalancesReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await reportContext(searchParams);
  const r = await balancesReport();
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Customers owe (credit)" value={formatPKR(r.kpis.customerCreditPaisa)} hint={`${r.kpis.customersOwing} account${r.kpis.customersOwing === 1 ? "" : "s"}`} />
        <KpiCard label="Owed to suppliers" value={formatPKR(r.kpis.supplierPayablesPaisa)} tone={r.kpis.supplierPayablesPaisa > 0 ? "negative" : undefined} />
        <KpiCard label="Supplier overpayments" value={formatPKR(r.kpis.supplierOverpaidPaisa)} />
        <KpiCard label="Net position" value={formatPKR(r.kpis.customerCreditPaisa + r.kpis.supplierOverpaidPaisa - r.kpis.supplierPayablesPaisa)} hint="Receivables minus payables" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Customer credit outstanding</CardTitle><CardDescription>Record payments on the customer&apos;s Credit tab.</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Owed</TableHead><TableHead className="text-right">Limit</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.creditCustomers.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No credit outstanding.</TableCell></TableRow> : null}
                {r.creditCustomers.map((c) => <TableRow key={c.id}><TableCell><Link href={`/customers/${c.id}?tab=credit`} className="font-medium hover:underline">{c.name}</Link>{c.phone ? <div className="text-xs text-muted-foreground">{c.phone}</div> : null}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(c.creditBalancePaisa)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(c.creditLimitPaisa)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Supplier balances</CardTitle><CardDescription>Positive = the store owes the supplier; negative = overpaid.</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.supplierBalances.length === 0 ? <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">All suppliers settled.</TableCell></TableRow> : null}
                {r.supplierBalances.map((s) => <TableRow key={s.id}><TableCell><Link href={`/suppliers/${s.id}?tab=statement`} className="font-medium hover:underline">{s.name}</Link></TableCell><TableCell className={`text-right tabular-nums ${s.balancePaisa > 0 ? "text-destructive" : ""}`}>{formatPKR(s.balancePaisa)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
