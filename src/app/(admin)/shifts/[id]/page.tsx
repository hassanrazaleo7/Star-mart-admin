import type { Metadata } from "next";
import { PrinterIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/order-status-badge";
import { KpiCard } from "@/components/reports/kpi-card";
import { StatusToast } from "@/components/status-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatLocalDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { getShift, shiftSummary } from "@/lib/shifts/queries";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { reopenShiftAction } from "../actions";
import { CloseShiftForm } from "../close-form";

export const metadata: Metadata = { title: "Shift" };

export default async function ShiftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const { id } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const shift = await getShift(id);
  const manager = isManager(user.role);
  if (!shift || (!manager && shift.cashierUserId !== user.id)) notFound();
  const [summary, settings] = await Promise.all([shiftSummary(shift.id, shift.openingFloatPaisa), getSettings()]);
  const tz = settings.store.timezone;
  const expected = shift.status === "closed" && shift.expectedCashPaisa != null ? shift.expectedCashPaisa : summary.expectedCashPaisa;
  const variance = shift.variancePaisa;
  const error = firstParam(raw.error);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{shift.number}</h1>
            <Badge variant={shift.status === "open" ? "default" : "outline"}>{shift.status}</Badge>
            {shift.reopenedAt ? <Badge variant="secondary">reopened</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {shift.cashier.name} · opened {formatLocalDateTime(shift.openedAt, tz)}
            {shift.closedAt ? ` · closed ${formatLocalDateTime(shift.closedAt, tz)}${shift.closer?.name ? ` by ${shift.closer.name}` : ""}` : ""}
            {shift.reopenedAt ? ` · reopened ${formatLocalDateTime(shift.reopenedAt, tz)}${shift.reopener?.name ? ` by ${shift.reopener.name}` : ""}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={`/print/shifts/${shift.id}?print=1`} target="_blank" prefetch={false} />}><PrinterIcon /> Print closing</Button>
          {manager && shift.status === "closed" ? (
            <form action={reopenShiftAction}><input type="hidden" name="shiftId" value={shift.id} /><Button type="submit" variant="destructive">Reopen</Button></form>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sales" value={String(summary.salesCount)} hint={`${formatQty(summary.itemsSold)} items · ${formatPKR(summary.grossPaisa)}${summary.cancelledCount ? ` · ${summary.cancelledCount} cancelled` : ""}`} />
        <KpiCard label="Expected cash" value={formatPKR(expected)} hint={`float ${formatPKR(shift.openingFloatPaisa)} + cash ${formatPKR(summary.cashInPaisa)}${summary.cashOutPaisa ? ` − refunds ${formatPKR(summary.cashOutPaisa)}` : ""}`} />
        <KpiCard label="Counted cash" value={shift.countedCashPaisa != null ? formatPKR(shift.countedCashPaisa) : "—"} hint={shift.status === "open" ? "Not counted yet" : undefined} />
        <KpiCard label="Variance" value={variance == null ? "—" : variance === 0 ? "Balanced" : `${variance < 0 ? "−" : "+"}${formatPKR(Math.abs(variance))}`} hint={variance == null ? undefined : variance < 0 ? "Drawer short" : variance > 0 ? "Drawer over" : undefined} tone={variance == null || variance === 0 ? undefined : "negative"} />
      </div>
      {shift.status === "open" && (manager || shift.cashierUserId === user.id) ? <CloseShiftForm shiftId={shift.id} expectedCashPaisa={summary.expectedCashPaisa} defaultNotes={shift.notes ?? ""} /> : null}
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle><CardDescription>Received and refunded during this shift.</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Refunded</TableHead></TableRow></TableHeader>
              <TableBody>
                {(["cash", "card", "bank_transfer", "credit"] as const).map((m) => <TableRow key={m}><TableCell>{PAYMENT_METHOD_LABELS[m]}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(summary.byMethod[m].receivedPaisa)}</TableCell><TableCell className="text-right tabular-nums">{summary.byMethod[m].refundedPaisa ? formatPKR(summary.byMethod[m].refundedPaisa) : "—"}</TableCell></TableRow>)}
                <TableRow className="text-xs text-muted-foreground"><TableCell>Discounts / points / tax</TableCell><TableCell colSpan={2} className="text-right tabular-nums">{formatPKR(summary.discountPaisa)} / {formatPKR(summary.pointsValuePaisa)} / {formatPKR(summary.taxPaisa)}</TableCell></TableRow>
              </TableBody>
            </Table>
            {shift.notes ? <p className="mt-3 rounded-md bg-muted p-2 text-xs">{shift.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sales in this shift</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Time</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Payment</TableHead></TableRow></TableHeader>
              <TableBody>
                {shift.orders.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sales yet.</TableCell></TableRow> : null}
                {shift.orders.map((o) => <TableRow key={o.id}><TableCell><Link href={`/orders/${o.id}`} className="font-mono font-medium hover:underline">{o.number}</Link></TableCell><TableCell>{o.customerName ?? <span className="text-muted-foreground">Walk-in</span>}</TableCell><TableCell className="whitespace-nowrap">{formatLocalDateTime(o.createdAt, tz)}</TableCell><TableCell><OrderStatusBadge status={o.status} /></TableCell><TableCell className="text-right tabular-nums">{formatPKR(o.totalPaisa)}</TableCell><TableCell><PaymentStatusBadge status={o.paymentStatus} /></TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
