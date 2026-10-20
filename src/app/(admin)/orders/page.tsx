import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/order-status-badge";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatLocalDateTime } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { listOrders, ORDERS_PAGE_SIZE } from "@/lib/orders/queries";
import { ORDER_STATUS_LABELS } from "@/lib/orders/types";
import { orderListParamsSchema } from "@/lib/orders/validation";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.staff);
  const parsed = orderListParamsSchema.safeParse(Object.fromEntries(["q", "status", "fulfillment", "payment", "channel", "customer", "from", "to", "page"].map((k) => [k, firstParam(raw[k]) || undefined])));
  const params = parsed.success ? parsed.data : orderListParamsSchema.parse({});
  const settings = await getSettings();
  const result = await listOrders(params, settings.store.timezone);
  const qs = { q: params.q, status: params.status, fulfillment: params.fulfillment, payment: params.payment, channel: params.channel, customer: params.customer, from: params.from, to: params.to };

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.msg)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">{result.total} order{result.total === 1 ? "" : "s"} · {formatPKR(result.sumPaisa)} in the current filter.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/pos" />}>Open POS</Button>
          <Button nativeButton={false} render={<Link href="/orders/new" />}><PlusIcon /> New order</Button>
        </div>
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Order no., customer or phone" className="max-w-xs" data-scanner-ignore />
        <NativeSelect name="status" defaultValue={params.status}>
          <NativeSelectOption value="all">Any status</NativeSelectOption>
          <NativeSelectOption value="open">Open</NativeSelectOption>
          {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect name="fulfillment" defaultValue={params.fulfillment ?? ""}><NativeSelectOption value="">Pickup and delivery</NativeSelectOption><NativeSelectOption value="pickup">Pickup</NativeSelectOption><NativeSelectOption value="delivery">Delivery</NativeSelectOption></NativeSelect>
        <NativeSelect name="payment" defaultValue={params.payment ?? ""}><NativeSelectOption value="">Any payment</NativeSelectOption><NativeSelectOption value="unpaid">Unpaid</NativeSelectOption><NativeSelectOption value="partial">Partial</NativeSelectOption><NativeSelectOption value="paid">Paid</NativeSelectOption><NativeSelectOption value="refunded">Refunded</NativeSelectOption></NativeSelect>
        <NativeSelect name="channel" defaultValue={params.channel ?? ""}><NativeSelectOption value="">All channels</NativeSelectOption><NativeSelectOption value="pos">POS</NativeSelectOption><NativeSelectOption value="phone">Phone</NativeSelectOption><NativeSelectOption value="walk_in">Walk-in</NativeSelectOption></NativeSelect>
        <Input type="date" name="from" defaultValue={params.from ?? ""} className="w-40" aria-label="From date" />
        <Input type="date" name="to" defaultValue={params.to ?? ""} className="w-40" aria-label="To date" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Payment</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No orders match.</TableCell></TableRow> : null}
              {result.rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell><Link href={`/orders/${o.id}`} className="font-mono font-medium hover:underline">{o.number}</Link><div className="text-xs text-muted-foreground">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</div></TableCell>
                  <TableCell>{o.customerId ? <Link href={`/customers/${o.customerId}`} className="hover:underline">{o.customerName}</Link> : o.customerName ? <>{o.customerName} <Badge variant="outline">guest</Badge></> : <span className="text-muted-foreground">Walk-in</span>}{o.customerPhone ? <div className="text-xs text-muted-foreground">{o.customerPhone}</div> : null}</TableCell>
                  <TableCell><Badge variant="outline">{o.channel.replace("_", "-")}</Badge> {o.fulfillment === "delivery" ? <Badge variant="secondary">delivery</Badge> : null}{o.scheduledFor ? <div className="text-xs text-muted-foreground">for {formatLocalDateTime(o.scheduledFor, settings.store.timezone)}</div> : null}</TableCell>
                  <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(o.totalPaisa)}</TableCell>
                  <TableCell><PaymentStatusBadge status={o.paymentStatus} />{o.paymentStatus === "partial" ? <div className="text-xs text-muted-foreground">{formatPKR(o.paidPaisa)} paid</div> : null}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatLocalDateTime(o.createdAt, settings.store.timezone)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={ORDERS_PAGE_SIZE} basePath="/orders" params={qs} />
        </CardContent>
      </Card>
    </div>
  );
}
