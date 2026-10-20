import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { customerCreditLedger, customerOrders, customerPointsLedger, getCustomer } from "@/lib/customers/queries";
import { formatDateTime } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { setCustomerActiveAction } from "../actions";
import { CustomerFormDialog } from "../customer-form-dialog";
import { AdjustPointsForm, RecordCreditPaymentForm } from "./ledger-forms";

export const metadata: Metadata = { title: "Customer" };

const TABS = ["orders", "points", "credit"] as const;

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const { id } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const tab = TABS.includes(firstParam(raw.tab) as (typeof TABS)[number]) ? (firstParam(raw.tab) as (typeof TABS)[number]) : "orders";
  const manager = isManager(user.role);
  const settings = await getSettings();
  const available = customer.creditLimitPaisa - customer.creditBalancePaisa;

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{customer.name}</h1>
            <Badge variant="outline">{customer.type}</Badge>
            {!customer.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{[customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "No contact details"}</p>
        </div>
        <div className="flex gap-2">
          <Button nativeButton={false} render={<Link href={`/orders/new?customer=${customer.id}`} />}>New order</Button>
          <CustomerFormDialog customer={customer} canSetCredit={manager} trigger={<Button variant="outline" />} />
          {manager ? (
            <form action={setCustomerActiveAction}>
              <input type="hidden" name="customerId" value={customer.id} />
              <input type="hidden" name="active" value={customer.isActive ? "false" : "true"} />
              <Button type="submit" variant="ghost">{customer.isActive ? "Deactivate" : "Activate"}</Button>
            </form>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm"><CardHeader><CardDescription>Loyalty points</CardDescription><CardTitle>{customer.pointsBalance} <span className="text-sm font-normal text-muted-foreground">≈ {formatPKR(customer.pointsBalance * settings.loyalty.redeemValuePaisa)}</span></CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Credit owed</CardDescription><CardTitle className={customer.creditBalancePaisa > 0 ? "text-destructive" : ""}>{formatPKR(customer.creditBalancePaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Credit available</CardDescription><CardTitle>{customer.creditLimitPaisa > 0 ? `${formatPKR(Math.max(0, available))} of ${formatPKR(customer.creditLimitPaisa)}` : "No credit"}</CardTitle></CardHeader></Card>
      </div>
      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t} href={`/customers/${id}?tab=${t}`} className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${t === tab ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</Link>
        ))}
      </nav>
      {tab === "orders" ? <OrdersCard customerId={id} /> : null}
      {tab === "points" ? (
        <Card>
          <CardHeader><CardTitle>Points ledger</CardTitle><CardDescription>Earn {settings.loyalty.earnPerPaisa / 100} PKR = 1 point · 1 point = {formatPKR(settings.loyalty.redeemValuePaisa)} · min {settings.loyalty.minRedeemPoints} to redeem.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            {manager ? <AdjustPointsForm customerId={id} /> : null}
            <PointsLedger customerId={id} />
          </CardContent>
        </Card>
      ) : null}
      {tab === "credit" ? (
        <Card>
          <CardHeader><CardTitle>Credit account</CardTitle><CardDescription>Credit sales increase the balance owed; payments reduce it.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <RecordCreditPaymentForm customerId={id} outstandingPaisa={customer.creditBalancePaisa} />
            <CreditLedger customerId={id} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function OrdersCard({ customerId }: { customerId: string }) {
  const rows = await customerOrders(customerId);
  return (
    <Card>
      <CardHeader><CardTitle>Orders</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Payment</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No orders yet.</TableCell></TableRow> : null}
            {rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell><Link href={`/orders/${o.id}`} className="font-medium hover:underline">{o.number}</Link></TableCell>
                <TableCell>{formatDateTime(o.createdAt)}</TableCell>
                <TableCell><Badge variant="outline">{o.channel.replace("_", " ")}</Badge> {o.fulfillment === "delivery" ? <Badge variant="secondary">delivery</Badge> : null}</TableCell>
                <TableCell><Badge variant={o.status === "completed" ? "outline" : o.status === "cancelled" ? "secondary" : "default"}>{o.status.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(o.totalPaisa)}</TableCell>
                <TableCell><Badge variant={o.paymentStatus === "paid" ? "outline" : "destructive"}>{o.paymentStatus}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

async function PointsLedger({ customerId }: { customerId: string }) {
  const rows = await customerPointsLedger(customerId);
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Kind</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Points</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No points activity yet.</TableCell></TableRow> : null}
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{formatDateTime(r.createdAt)}</TableCell>
            <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
            <TableCell>{r.orderId ? <Link href={`/orders/${r.orderId}`} className="hover:underline">{r.orderNumber}</Link> : null}{r.note ? <span className="text-muted-foreground"> {r.note}</span> : null}</TableCell>
            <TableCell className={`text-right tabular-nums ${r.pointsDelta < 0 ? "text-destructive" : "text-primary"}`}>{r.pointsDelta > 0 ? "+" : ""}{r.pointsDelta}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function CreditLedger({ customerId }: { customerId: string }) {
  const rows = await customerCreditLedger(customerId);
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead className="text-right">Charged</TableHead><TableHead className="text-right">Paid</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No credit activity yet.</TableCell></TableRow> : null}
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell>{formatDateTime(r.date)}</TableCell>
            <TableCell><Badge variant="outline" className="mr-2 capitalize">{r.kind}</Badge>{r.orderId ? <Link href={`/orders/${r.orderId}`} className="hover:underline">{r.ref}</Link> : r.ref}{r.note ? <span className="text-xs text-muted-foreground"> · {r.note}</span> : null}</TableCell>
            <TableCell className="text-right tabular-nums">{r.debitPaisa ? formatPKR(r.debitPaisa) : ""}</TableCell>
            <TableCell className="text-right tabular-nums">{r.creditPaisa ? formatPKR(r.creditPaisa) : ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
