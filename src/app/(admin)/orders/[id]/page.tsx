import type { Metadata } from "next";
import { DownloadIcon, MailIcon, PrinterIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/order-status-badge";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatLocalDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { getOrder } from "@/lib/orders/queries";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { emailInvoiceAction } from "../actions";
import { RecordPaymentDialog, StatusActions } from "./order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const { id } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [order, settings] = await Promise.all([getOrder(id), getSettings()]);
  if (!order) notFound();
  const tz = settings.store.timezone;
  const manager = isManager(user.role);
  const summary = { id: order.id, status: order.status, fulfillment: order.fulfillment, paymentStatus: order.paymentStatus, totalPaisa: order.totalPaisa, paidPaisa: order.paidPaisa, customer: order.customer ? { creditLimitPaisa: order.customer.creditLimitPaisa, creditBalancePaisa: order.customer.creditBalancePaisa } : null };
  const canCancel = manager || order.status === "pending";

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{order.number}</h1>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
            <Badge variant="outline">{order.channel.replace("_", "-")}</Badge>
            <Badge variant="secondary">{order.fulfillment}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created {formatLocalDateTime(order.createdAt, tz)}
            {order.scheduledFor ? ` · scheduled ${formatLocalDateTime(order.scheduledFor, tz)}` : ""}
            {order.completedAt ? ` · completed ${formatLocalDateTime(order.completedAt, tz)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecordPaymentDialog order={summary} />
          <StatusActions order={summary} canCancel={canCancel} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Items</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {order.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.productId ? <Link href={`/products/${i.productId}/edit`} className="font-medium hover:underline">{i.name}</Link> : <span className="font-medium">{i.name}</span>}<div className="font-mono text-xs text-muted-foreground">{i.sku}</div></TableCell>
                      <TableCell className="text-right">{formatQty(i.qty, i.unit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(i.unitPricePaisa)}</TableCell>
                      <TableCell className="text-right tabular-nums">{i.discountPaisa ? formatPKR(i.discountPaisa) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(i.lineTotalPaisa)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payments</CardTitle><CardDescription>{formatPKR(order.paidPaisa)} of {formatPKR(order.totalPaisa)} paid.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>By</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {order.payments.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No payments yet.</TableCell></TableRow> : null}
                  {order.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatLocalDateTime(p.createdAt, tz)}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[p.method]}{p.changePaisa ? <div className="text-xs text-muted-foreground">received {formatPKR(p.receivedPaisa ?? 0)}, change {formatPKR(p.changePaisa)}</div> : null}</TableCell>
                      <TableCell>{p.reference ?? ""}{p.note ? <div className="text-xs text-muted-foreground">{p.note}</div> : null}</TableCell>
                      <TableCell>{p.createdBy?.name ?? "—"}</TableCell>
                      <TableCell className={`text-right tabular-nums ${p.amountPaisa < 0 ? "text-destructive" : ""}`}>{formatPKR(p.amountPaisa)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-sm">
                {order.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="w-44 shrink-0 text-muted-foreground">{formatLocalDateTime(e.createdAt, tz)}</span>
                    <span className="font-medium">{e.fromStatus ? `${ORDER_STATUS_LABELS[e.fromStatus]} → ` : ""}{ORDER_STATUS_LABELS[e.toStatus]}</span>
                    <span className="text-muted-foreground">{e.actor?.name ? `by ${e.actor.name}` : ""}{e.note ? ` · ${e.note}` : ""}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {order.customerId ? <Link href={`/customers/${order.customerId}`} className="font-medium hover:underline">{order.customerName}</Link> : <span className="font-medium">{order.customerName ?? "Walk-in customer"}</span>}
              {order.customerPhone ? <span>{order.customerPhone}</span> : null}
              {order.customerEmail ? <span>{order.customerEmail}</span> : null}
              {order.deliveryAddress ? <span className="whitespace-pre-line text-muted-foreground">{order.deliveryAddress}</span> : null}
              {order.customer ? <span className="text-xs text-muted-foreground">{order.customer.pointsBalance} points · credit {formatPKR(order.customer.creditBalancePaisa)} / {formatPKR(order.customer.creditLimitPaisa)}</span> : null}
              {order.notes ? <p className="mt-2 rounded-md bg-muted p-2 text-xs">{order.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatPKR(order.subtotalPaisa)}</span></div>
              {order.discountPaisa ? <div className="flex justify-between"><span className="text-muted-foreground">Discount{order.discountCode ? ` (${order.discountCode})` : ""}</span><span className="tabular-nums">−{formatPKR(order.discountPaisa)}</span></div> : null}
              {order.pointsValuePaisa ? <div className="flex justify-between"><span className="text-muted-foreground">Points ({order.pointsRedeemed})</span><span className="tabular-nums">−{formatPKR(order.pointsValuePaisa)}</span></div> : null}
              {order.deliveryFeePaisa ? <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span className="tabular-nums">{formatPKR(order.deliveryFeePaisa)}</span></div> : null}
              <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{formatPKR(order.totalPaisa)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Includes tax</span><span className="tabular-nums">{formatPKR(order.taxPaisa)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums">{formatPKR(order.paidPaisa)}</span></div>
              <div className="flex justify-between font-medium"><span>Balance due</span><span className="tabular-nums">{formatPKR(Math.max(0, order.totalPaisa - order.paidPaisa))}</span></div>
              {order.pointsEarned ? <div className="flex justify-between text-xs text-muted-foreground"><span>Points earned</span><span>{order.pointsEarned}{order.status !== "completed" ? " (on completion)" : ""}</span></div> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Invoice</CardTitle><CardDescription>{order.invoice ? `${order.invoice.number} · ${order.invoice.status}${order.invoice.dueAt && order.invoice.status === "issued" ? ` · due ${formatLocalDateTime(order.invoice.dueAt, tz)}` : ""}` : "Issued when the order is confirmed."}</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/invoices/${order.id}?print=1`} target="_blank" />}><PrinterIcon /> Print</Button>
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/api/invoices/${order.id}/pdf`} prefetch={false} />}><DownloadIcon /> PDF</Button>
              </div>
              {order.invoice ? (
                <form action={emailInvoiceAction} className="flex gap-2">
                  <input type="hidden" name="orderId" value={order.id} />
                  <Input name="email" type="email" defaultValue={order.customerEmail ?? ""} placeholder="customer@example.com" aria-label="Email address" data-scanner-ignore />
                  <Button type="submit" variant="outline" size="sm"><MailIcon /> Email</Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
