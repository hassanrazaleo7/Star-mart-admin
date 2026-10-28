import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/order-status-badge";
import { TimeSeriesChart } from "@/components/reports/charts";
import { KpiCard } from "@/components/reports/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { dashboardData } from "@/lib/dashboard";
import { formatLocalDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { expiryBadgeVariant, expiryHint, expiryStatus } from "@/lib/stock/expiry";
import { expirySummary, soonestExpiring } from "@/lib/stock/expiry-queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const settings = await getSettings();
  const tz = settings.store.timezone;
  const d = await dashboardData(user.role, tz);
  const manager = isManager(user.role);
  const today = storeToday(tz);
  const warningDays = settings.stock.expiryWarningDays;
  const [expiry, expiringList] = manager ? await Promise.all([expirySummary(today, warningDays), soonestExpiring(today, warningDays)]) : [null, []];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Welcome back, {user.name}</h1>
          <p className="text-sm text-muted-foreground">{settings.store.name} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: tz }).format(new Date())}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/pos" />}>Open POS</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/orders/new" />}>New order</Button>
          {manager ? <Button variant="outline" nativeButton={false} render={<Link href="/purchases/new" />}>New purchase</Button> : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sales today" value={formatPKR(d.today.revenuePaisa)} hint={`${d.today.orderCount} completed · ${formatQty(d.today.itemsSold)} items`} />
        <KpiCard label="Open orders" value={String(d.openOrders.total)} hint={`${d.openOrders.pending} pending · ${d.openOrders.outForDelivery} out for delivery · ${d.openShifts} open shift${d.openShifts === 1 ? "" : "s"}`} />
        <KpiCard label="Low stock" value={String(d.stock.low)} hint={`${d.stock.out} out of stock`} tone={d.stock.low ? "negative" : undefined} />
        {manager ? <KpiCard label="Pending approvals" value={String(d.pendingApprovals)} hint="Supplier submissions" tone={d.pendingApprovals ? "negative" : undefined} /> : <KpiCard label="Customers" value={String(d.customers.total)} hint={`${d.customers.withPoints} with points`} />}
      </div>
      {manager && d.balances ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Stock at cost" value={formatPKR(d.stock.valuationPaisa)} />
          {expiry ? (
            <KpiCard
              label="Expired / expiring stock"
              value={`${expiry.productsExpired} / ${expiry.productsSoon}`}
              hint={`${formatPKR(expiry.expiredValuePaisa)} expired · ${formatPKR(expiry.soonValuePaisa)} within ${warningDays} days`}
              tone={expiry.expiredBatches ? "negative" : undefined}
            />
          ) : null}
          <KpiCard label="Customers owe" value={formatPKR(d.balances.customerCreditPaisa)} hint={`${d.balances.customersOwing} credit accounts`} />
          <KpiCard label="Owed to suppliers" value={formatPKR(d.balances.supplierPayablesPaisa)} tone={d.balances.supplierPayablesPaisa ? "negative" : undefined} />
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader><CardTitle>Last 14 days</CardTitle><CardDescription>Completed sales per day.</CardDescription></CardHeader>
          <CardContent><TimeSeriesChart data={d.series} series={[{ key: "revenuePaisa", label: "Sales" }]} height={220} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Low stock</CardTitle><CardDescription><Link href="/stock?low=1" className="underline">See all</Link></CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {d.lowStockList.length === 0 ? <p className="text-muted-foreground">Nothing is below its reorder level.</p> : null}
            {d.lowStockList.map((p) => <div key={p.id} className="flex items-center justify-between gap-2"><Link href={`/products/${p.id}/edit`} className="truncate hover:underline">{p.name}</Link><Badge variant={p.stockQty <= 0 ? "destructive" : "secondary"}>{formatQty(p.stockQty, p.unit)}</Badge></div>)}
          </CardContent>
        </Card>
      </div>
      {manager ? (
        <Card>
          <CardHeader><CardTitle>Expiring soon</CardTitle><CardDescription>Earliest-dated batches still in stock · <Link href="/stock/expiry" className="underline">Expiry page</Link></CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            {expiringList.length === 0 ? <p className="text-muted-foreground">Nothing expires within {warningDays} days.</p> : null}
            {expiringList.map((b) => {
              const status = expiryStatus(b.expiry, today, b.expiryWarningDays ?? warningDays);
              return (
                <div key={b.id} className="flex items-center justify-between gap-2">
                  <Link href={`/products/${b.productId}/edit#batches`} className="truncate hover:underline">{b.productName} <span className="text-muted-foreground">· {formatQty(b.qtyRemaining, b.unit)}</span></Link>
                  <Badge variant={expiryBadgeVariant(status)}>{expiryHint(b.expiry, today)}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Recent orders</CardTitle><CardDescription><Link href="/orders" className="underline">All orders</Link></CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Payment</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.recent.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No orders yet.</TableCell></TableRow> : null}
              {d.recent.map((o) => <TableRow key={o.id}><TableCell><Link href={`/orders/${o.id}`} className="font-mono font-medium hover:underline">{o.number}</Link></TableCell><TableCell>{o.customerName ?? <span className="text-muted-foreground">Walk-in</span>}</TableCell><TableCell><Badge variant="outline">{o.channel.replace("_", "-")}</Badge></TableCell><TableCell><OrderStatusBadge status={o.status} /></TableCell><TableCell className="text-right tabular-nums">{formatPKR(o.totalPaisa)}</TableCell><TableCell><PaymentStatusBadge status={o.paymentStatus} /></TableCell><TableCell className="whitespace-nowrap">{formatLocalDateTime(o.createdAt, tz)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
