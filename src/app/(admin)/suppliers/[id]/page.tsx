import type { Metadata } from "next";
import { PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { getSupplier, listPurchases, listSupplierPayments, listSupplierProducts, listSupplierReturns, supplierBalance, supplierStatement } from "@/lib/suppliers/queries";
import { setSupplierActiveAction } from "../actions";
import { RecordPaymentDialog, RecordReturnDialog } from "./supplier-dialogs";

export const metadata: Metadata = { title: "Supplier" };

const TABS = ["overview", "products", "purchases", "payments", "returns", "statement"] as const;
type Tab = (typeof TABS)[number];

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireRole(ROLE_GROUPS.managers);
  const { id } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  const tab: Tab = TABS.includes(firstParam(raw.tab) as Tab) ? (firstParam(raw.tab) as Tab) : "overview";

  const [balance, purchases, products] = await Promise.all([supplierBalance(id), listPurchases({ supplier: id, page: 1 }), listSupplierProducts(id)]);
  const openPurchases = purchases.rows.filter((p) => p.status === "received" && p.paidPaisa < p.totalPaisa).map((p) => ({ id: p.id, number: p.number, outstandingPaisa: p.totalPaisa - p.paidPaisa }));
  const statusVariant = balance.status === "owed" ? "destructive" : balance.status === "overpaid" ? "default" : "outline";

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{supplier.name}</h1>
            {supplier.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{[supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "No contact details"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecordPaymentDialog supplierId={id} purchases={openPurchases} />
          <RecordReturnDialog supplierId={id} products={products.filter((p) => p.status !== "archived")} purchases={purchases.rows.filter((p) => p.status === "received").map((p) => ({ id: p.id, number: p.number, outstandingPaisa: p.totalPaisa - p.paidPaisa }))} />
          <Button variant="outline" nativeButton={false} render={<Link href={`/purchases/new?supplier=${id}`} />}>
            <PlusIcon /> New purchase
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href={`/suppliers/${id}/edit`} />}>
            <PencilIcon /> Edit
          </Button>
          <form action={setSupplierActiveAction}>
            <input type="hidden" name="supplierId" value={id} />
            <input type="hidden" name="active" value={supplier.isActive ? "false" : "true"} />
            <Button type="submit" variant="ghost">{supplier.isActive ? "Deactivate" : "Activate"}</Button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card size="sm"><CardHeader><CardDescription>Purchased (received)</CardDescription><CardTitle className="tabular-nums">{formatPKR(balance.purchasedPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Paid</CardDescription><CardTitle className="tabular-nums">{formatPKR(balance.paidPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Returned</CardDescription><CardTitle className="tabular-nums">{formatPKR(balance.returnedPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Balance</CardDescription><CardTitle className="flex items-center gap-2 tabular-nums">{formatPKR(balance.balancePaisa)} <Badge variant={statusVariant}>{balance.status}</Badge></CardTitle></CardHeader></Card>
      </div>

      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t} href={`/suppliers/${id}?tab=${t}`} className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${t === tab ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div><span className="text-muted-foreground">Address:</span> {supplier.address ?? "—"}</div>
              <div><span className="text-muted-foreground">Tax ID:</span> {supplier.taxId ?? "—"}</div>
              <div><span className="text-muted-foreground">Payment terms:</span> {supplier.paymentTerms ?? "—"}</div>
              <div><span className="text-muted-foreground">Notes:</span> {supplier.notes ?? "—"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent purchases</CardTitle></CardHeader>
            <CardContent>
              <PurchasesTable rows={purchases.rows.slice(0, 5)} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "products" ? (
        <Card>
          <CardHeader><CardTitle>Products supplied</CardTitle><CardDescription>{products.length} product{products.length === 1 ? "" : "s"}</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {products.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No products linked to this supplier.</TableCell></TableRow> : null}
                {products.map((p) => {
                  const low = p.reorderLevel > 0 && p.stockQty <= p.reorderLevel;
                  return (
                    <TableRow key={p.id}>
                      <TableCell><Link href={`/products/${p.id}/edit`} className="font-medium hover:underline">{p.name}</Link><div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(p.costPaisa)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(p.pricePaisa)}</TableCell>
                      <TableCell className="text-right"><Badge variant={low ? "destructive" : "secondary"}>{formatQty(p.stockQty, p.unit)}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {tab === "purchases" ? (
        <Card>
          <CardHeader><CardTitle>Purchases</CardTitle></CardHeader>
          <CardContent><PurchasesTable rows={purchases.rows} /></CardContent>
        </Card>
      ) : null}

      {tab === "payments" ? <PaymentsCard supplierId={id} /> : null}
      {tab === "returns" ? <ReturnsCard supplierId={id} /> : null}
      {tab === "statement" ? <StatementCard supplierId={id} /> : null}
    </div>
  );
}

function PurchasesTable({ rows }: { rows: Awaited<ReturnType<typeof listPurchases>>["rows"] }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Payment</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No purchases yet.</TableCell></TableRow> : null}
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell><Link href={`/purchases/${p.id}`} className="font-medium hover:underline">{p.number}</Link>{p.invoiceRef ? <div className="text-xs text-muted-foreground">Inv. {p.invoiceRef}</div> : null}</TableCell>
            <TableCell><Badge variant={p.status === "received" ? "outline" : p.status === "cancelled" ? "secondary" : "default"}>{p.status}</Badge></TableCell>
            <TableCell>{formatDateTime(p.receivedAt)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPKR(p.totalPaisa)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPKR(p.paidPaisa)}</TableCell>
            <TableCell><Badge variant={p.paymentStatus === "paid" ? "outline" : "destructive"}>{p.paymentStatus}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function PaymentsCard({ supplierId }: { supplierId: string }) {
  const rows = await listSupplierPayments(supplierId);
  return (
    <Card>
      <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Purchase</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No payments yet.</TableCell></TableRow> : null}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDateTime(r.paidAt)}</TableCell>
                <TableCell>{r.purchaseNumber ? <Link href={`/purchases/${r.purchaseId}`} className="hover:underline">{r.purchaseNumber}</Link> : <span className="text-muted-foreground">On account</span>}</TableCell>
                <TableCell className="capitalize">{r.method.replace("_", " ")}</TableCell>
                <TableCell>{r.reference ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(r.amountPaisa)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

async function ReturnsCard({ supplierId }: { supplierId: string }) {
  const rows = await listSupplierReturns(supplierId);
  return (
    <Card>
      <CardHeader><CardTitle>Returns</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No returns yet.</TableCell></TableRow> : null}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDateTime(r.createdAt)}</TableCell>
                <TableCell>{r.productName}{r.purchaseNumber ? <span className="text-xs text-muted-foreground"> · {r.purchaseNumber}</span> : null}</TableCell>
                <TableCell className="text-right">{formatQty(r.qty, r.unit)}</TableCell>
                <TableCell>{r.reason ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(r.amountPaisa)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

async function StatementCard({ supplierId }: { supplierId: string }) {
  const rows = await supplierStatement(supplierId);
  return (
    <Card>
      <CardHeader><CardTitle>Statement</CardTitle><CardDescription>Running balance of what the store owes (positive) or is owed (negative).</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No entries yet.</TableCell></TableRow> : null}
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{formatDateTime(r.date)}</TableCell>
                <TableCell><Badge variant="outline" className="mr-2 capitalize">{r.kind}</Badge>{r.refId ? <Link href={`/purchases/${r.refId}`} className="hover:underline">{r.ref}</Link> : r.ref}{r.note ? <span className="text-xs text-muted-foreground"> · {r.note}</span> : null}</TableCell>
                <TableCell className="text-right tabular-nums">{r.debitPaisa ? formatPKR(r.debitPaisa) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{r.creditPaisa ? formatPKR(r.creditPaisa) : ""}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatPKR(r.balancePaisa)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
