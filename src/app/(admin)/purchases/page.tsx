import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { listSupplierOptions } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { listPurchases, PAGE_SIZE } from "@/lib/suppliers/queries";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const params = { status: firstParam(raw.status) ?? "", supplier: firstParam(raw.supplier) ?? "", payment: firstParam(raw.payment) ?? "", q: firstParam(raw.q) ?? "", page: Math.max(1, Number(firstParam(raw.page) ?? 1) || 1) };
  const [result, suppliers] = await Promise.all([listPurchases({ ...params, supplier: params.supplier || undefined }), listSupplierOptions()]);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status_msg)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Purchases</h1>
          <p className="text-sm text-muted-foreground">{result.total} purchase order{result.total === 1 ? "" : "s"}</p>
        </div>
        <Button nativeButton={false} render={<Link href="/purchases/new" />}><PlusIcon /> New purchase</Button>
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={params.q} placeholder="Number or invoice ref" className="max-w-xs" data-scanner-ignore />
        <NativeSelect name="status" defaultValue={params.status}><NativeSelectOption value="">Any status</NativeSelectOption><NativeSelectOption value="draft">Draft</NativeSelectOption><NativeSelectOption value="received">Received</NativeSelectOption><NativeSelectOption value="cancelled">Cancelled</NativeSelectOption></NativeSelect>
        <NativeSelect name="payment" defaultValue={params.payment}><NativeSelectOption value="">Any payment</NativeSelectOption><NativeSelectOption value="unpaid">Unpaid</NativeSelectOption><NativeSelectOption value="partial">Partial</NativeSelectOption><NativeSelectOption value="paid">Paid</NativeSelectOption></NativeSelect>
        <NativeSelect name="supplier" defaultValue={params.supplier}><NativeSelectOption value="">All suppliers</NativeSelectOption>{suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}</NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Items</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Payment</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No purchases found.</TableCell></TableRow> : null}
              {result.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link href={`/purchases/${p.id}`} className="font-medium hover:underline">{p.number}</Link>{p.invoiceRef ? <div className="text-xs text-muted-foreground">Inv. {p.invoiceRef}</div> : null}</TableCell>
                  <TableCell><Link href={`/suppliers/${p.supplierId}`} className="hover:underline">{p.supplierName}</Link></TableCell>
                  <TableCell><Badge variant={p.status === "received" ? "outline" : p.status === "cancelled" ? "secondary" : "default"}>{p.status}</Badge></TableCell>
                  <TableCell>{formatDateTime(p.receivedAt)}</TableCell>
                  <TableCell className="text-right">{p.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(p.totalPaisa)}</TableCell>
                  <TableCell><Badge variant={p.paymentStatus === "paid" ? "outline" : "destructive"}>{p.paymentStatus}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={PAGE_SIZE} basePath="/purchases" params={{ status: params.status, supplier: params.supplier, payment: params.payment, q: params.q }} />
        </CardContent>
      </Card>
    </div>
  );
}
