import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
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
import { formatLocalDateTime } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { listCashiers, listShifts, SHIFTS_PAGE_SIZE } from "@/lib/shifts/queries";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { shiftListParamsSchema } from "@/lib/validation/shifts";
import { Variance } from "./variance";

export const metadata: Metadata = { title: "Shifts" };

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const raw = await searchParams;
  const manager = isManager(user.role);
  const parsed = shiftListParamsSchema.safeParse(Object.fromEntries(["q", "cashier", "status", "variance", "range", "from", "to", "page"].map((k) => [k, firstParam(raw[k]) || undefined])));
  const params = parsed.success ? parsed.data : shiftListParamsSchema.parse({});
  const settings = await getSettings();
  const [result, cashiers] = await Promise.all([listShifts(params, settings.store.timezone, manager ? undefined : user.id), manager ? listCashiers() : Promise.resolve([])]);
  const tz = settings.store.timezone;
  const qs = { q: params.q, cashier: manager ? params.cashier : undefined, status: params.status, variance: params.variance, range: result.range.preset, from: result.range.preset === "custom" ? result.range.from : undefined, to: result.range.preset === "custom" ? result.range.to : undefined };
  const exportQs = new URLSearchParams(Object.entries(qs).filter((e): e is [string, string] => Boolean(e[1])));

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{manager ? "Shifts and closings" : "My shifts"}</h1>
          <p className="text-sm text-muted-foreground">{result.total} shift{result.total === 1 ? "" : "s"} · {result.range.label}. Each shift is a till session with an opening float and a closing cash count.</p>
        </div>
        <div className="flex gap-2">
          {manager ? <Button variant="outline" nativeButton={false} render={<Link href={`/api/reports/shifts?${exportQs.toString()}`} prefetch={false} />}><DownloadIcon /> Export CSV</Button> : null}
          <Button nativeButton={false} render={<Link href="/pos" />}>Open POS</Button>
        </div>
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Shift number" className="w-40" data-scanner-ignore />
        {manager ? (
          <NativeSelect name="cashier" defaultValue={params.cashier ?? ""} aria-label="Cashier">
            <NativeSelectOption value="">All cashiers</NativeSelectOption>
            {cashiers.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
          </NativeSelect>
        ) : null}
        <NativeSelect name="status" defaultValue={params.status} aria-label="Status"><NativeSelectOption value="all">Open and closed</NativeSelectOption><NativeSelectOption value="open">Open</NativeSelectOption><NativeSelectOption value="closed">Closed</NativeSelectOption></NativeSelect>
        <NativeSelect name="variance" defaultValue={params.variance} aria-label="Variance"><NativeSelectOption value="any">Any variance</NativeSelectOption><NativeSelectOption value="nonzero">With variance</NativeSelectOption><NativeSelectOption value="short">Short only</NativeSelectOption><NativeSelectOption value="over">Over only</NativeSelectOption></NativeSelect>
        <NativeSelect name="range" defaultValue={result.range.preset} aria-label="Date range"><NativeSelectOption value="today">Today</NativeSelectOption><NativeSelectOption value="7d">Last 7 days</NativeSelectOption><NativeSelectOption value="30d">Last 30 days</NativeSelectOption><NativeSelectOption value="month">This month</NativeSelectOption><NativeSelectOption value="custom">Custom</NativeSelectOption></NativeSelect>
        <Input type="date" name="from" defaultValue={result.range.from} className="w-40" aria-label="From date" />
        <Input type="date" name="to" defaultValue={result.range.to} className="w-40" aria-label="To date" />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      <Card>
        <CardHeader><CardTitle>Closings</CardTitle><CardDescription>Cash expected = opening float + cash received − cash refunded. Variance = counted − expected.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Shift</TableHead>{manager ? <TableHead>Cashier</TableHead> : null}<TableHead>Opened</TableHead><TableHead>Closed</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Cash</TableHead><TableHead className="text-right">Card</TableHead><TableHead className="text-right">Bank</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Counted</TableHead><TableHead className="text-right">Variance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={manager ? 13 : 12} className="text-center text-muted-foreground">No shifts in this range.</TableCell></TableRow> : null}
              {result.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Link href={`/shifts/${s.id}`} className="font-mono font-medium hover:underline">{s.number}</Link></TableCell>
                  {manager ? <TableCell>{s.cashierName}</TableCell> : null}
                  <TableCell className="whitespace-nowrap">{formatLocalDateTime(s.openedAt, tz)}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.closedAt ? formatLocalDateTime(s.closedAt, tz) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.sales}<div className="text-xs text-muted-foreground">{formatPKR(s.salesPaisa)}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(s.cashPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(s.cardPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(s.bankPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(s.creditPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.expectedCashPaisa != null ? formatPKR(s.expectedCashPaisa) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.countedCashPaisa != null ? formatPKR(s.countedCashPaisa) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums"><Variance paisa={s.variancePaisa} /></TableCell>
                  <TableCell><Badge variant={s.status === "open" ? "default" : "outline"}>{s.status}</Badge>{s.reopenedAt ? <div className="text-xs text-muted-foreground">reopened</div> : null}</TableCell>
                </TableRow>
              ))}
              {result.rows.length ? (
                <TableRow className="font-semibold" data-testid="shift-totals">
                  <TableCell colSpan={manager ? 4 : 3}>Totals ({result.totals.shifts} shift{result.totals.shifts === 1 ? "" : "s"} in filter)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(result.totals.salesPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(result.totals.cashPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(result.totals.cardPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(result.totals.bankPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(result.totals.creditPaisa)}</TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className="text-right tabular-nums"><Variance paisa={result.totals.variancePaisa} /></TableCell>
                  <TableCell />
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={SHIFTS_PAGE_SIZE} basePath="/shifts" params={qs} />
        </CardContent>
      </Card>
    </div>
  );
}

