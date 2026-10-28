import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusToast } from "@/components/status-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { getSettings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { EXPIRY_STATUS_LABEL, expiryBadgeVariant, expiryStatus } from "@/lib/stock/expiry";
import { getPurchase } from "@/lib/suppliers/queries";
import { RecordPaymentDialog } from "../../suppliers/[id]/supplier-dialogs";
import { cancelPurchaseAction, receivePurchaseAction } from "../actions";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireRole(ROLE_GROUPS.managers);
  const { id } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const purchase = await getPurchase(id);
  if (!purchase) notFound();
  const outstanding = purchase.totalPaisa - purchase.paidPaisa;
  const settings = await getSettings();
  const today = storeToday(settings.store.timezone);
  const receiveError = firstParam(raw.error);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      {receiveError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not receive: {receiveError.slice(0, 300)}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{purchase.number}</h1>
            <Badge variant={purchase.status === "received" ? "outline" : purchase.status === "cancelled" ? "secondary" : "default"}>{purchase.status}</Badge>
            <Badge variant={purchase.paymentStatus === "paid" ? "outline" : "destructive"}>{purchase.paymentStatus}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/suppliers/${purchase.supplierId}`} className="hover:underline">{purchase.supplier.name}</Link>
            {purchase.invoiceRef ? ` · Invoice ${purchase.invoiceRef}` : ""} · Created {formatDateTime(purchase.createdAt)}
            {purchase.receivedAt ? ` · Received ${formatDateTime(purchase.receivedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {purchase.status === "draft" ? (
            <>
              <form action={receivePurchaseAction} className="flex items-center gap-2">
                <input type="hidden" name="purchaseId" value={purchase.id} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" name="allowExpired" /> Accept expired lots</label>
                <Button type="submit">Mark received</Button>
              </form>
              <form action={cancelPurchaseAction}><input type="hidden" name="purchaseId" value={purchase.id} /><Button type="submit" variant="destructive">Cancel purchase</Button></form>
            </>
          ) : null}
          {purchase.status === "received" && outstanding > 0 ? (
            <RecordPaymentDialog supplierId={purchase.supplierId} purchases={[{ id: purchase.id, number: purchase.number, outstandingPaisa: outstanding }]} defaultPurchaseId={purchase.id} trigger={<Button />} />
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm"><CardHeader><CardDescription>Total</CardDescription><CardTitle className="tabular-nums">{formatPKR(purchase.totalPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Paid</CardDescription><CardTitle className="tabular-nums">{formatPKR(purchase.paidPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Outstanding</CardDescription><CardTitle className="tabular-nums">{formatPKR(outstanding)}</CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit cost</TableHead><TableHead>Batch / expiry</TableHead><TableHead className="text-right">Line total</TableHead></TableRow></TableHeader>
            <TableBody>
              {purchase.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell><Link href={`/products/${i.productId}/edit`} className="font-medium hover:underline">{i.product.name}</Link><div className="font-mono text-xs text-muted-foreground">{i.product.sku}</div></TableCell>
                  <TableCell className="text-right">{formatQty(i.qty, i.product.unit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(i.unitCostPaisa)}</TableCell>
                  <TableCell>
                    <div>{i.batch ?? "—"}</div>
                    {i.expiry ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {i.expiry}
                        {(() => {
                          const status = expiryStatus(i.expiry, today, settings.stock.expiryWarningDays);
                          return status === "fresh" ? null : <Badge variant={expiryBadgeVariant(status)}>{EXPIRY_STATUS_LABEL[status]}</Badge>;
                        })()}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(i.lineTotalPaisa)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {purchase.payments.length ? (
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {purchase.payments.map((p) => (
                  <TableRow key={p.id}><TableCell>{formatDateTime(p.paidAt)}</TableCell><TableCell className="capitalize">{p.method.replace("_", " ")}</TableCell><TableCell>{p.reference ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(p.amountPaisa)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {purchase.notes ? <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap">{purchase.notes}</CardContent></Card> : null}
    </div>
  );
}
