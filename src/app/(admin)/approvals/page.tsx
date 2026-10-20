import type { Metadata } from "next";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { listSupplierOptions } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { listSubmissions, PAGE_SIZE } from "@/lib/suppliers/queries";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const params = { status: firstParam(raw.state) ?? "pending", kind: firstParam(raw.kind) ?? "", supplier: firstParam(raw.supplier) ?? "", page: Math.max(1, Number(firstParam(raw.page) ?? 1) || 1) };
  const [result, suppliers] = await Promise.all([listSubmissions({ status: params.status === "all" ? undefined : params.status, kind: params.kind || undefined, supplier: params.supplier || undefined, page: params.page }), listSupplierOptions()]);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div>
        <h1 className="font-heading text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">Product and supply submissions from the supplier portal.</p>
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <NativeSelect name="state" defaultValue={params.status}><NativeSelectOption value="pending">Pending</NativeSelectOption><NativeSelectOption value="approved">Approved</NativeSelectOption><NativeSelectOption value="rejected">Rejected</NativeSelectOption><NativeSelectOption value="all">All</NativeSelectOption></NativeSelect>
        <NativeSelect name="kind" defaultValue={params.kind}><NativeSelectOption value="">Products and supplies</NativeSelectOption><NativeSelectOption value="product">Products</NativeSelectOption><NativeSelectOption value="supply">Supplies</NativeSelectOption></NativeSelect>
        <NativeSelect name="supplier" defaultValue={params.supplier}><NativeSelectOption value="">All suppliers</NativeSelectOption>{suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}</NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Supplier</TableHead><TableHead>Kind</TableHead><TableHead>Summary</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nothing to review.</TableCell></TableRow> : null}
              {result.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.number}</TableCell>
                  <TableCell><Link href={`/suppliers/${s.supplierId}`} className="hover:underline">{s.supplierName}</Link>{s.submitterName ? <div className="text-xs text-muted-foreground">by {s.submitterName}</div> : null}</TableCell>
                  <TableCell><Badge variant="outline">{s.kind}</Badge></TableCell>
                  <TableCell>{s.payload.kind === "product" ? s.payload.name : `${s.payload.items.length} line${s.payload.items.length === 1 ? "" : "s"}${s.payload.invoiceRef ? ` · Inv. ${s.payload.invoiceRef}` : ""}`}</TableCell>
                  <TableCell>{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell><Badge variant={s.status === "pending" ? "default" : s.status === "approved" ? "outline" : "secondary"}>{s.status}</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant={s.status === "pending" ? "default" : "outline"} nativeButton={false} render={<Link href={`/approvals/${s.id}`} />}>{s.status === "pending" ? "Review" : "View"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={PAGE_SIZE} basePath="/approvals" params={{ state: params.status, kind: params.kind, supplier: params.supplier }} />
        </CardContent>
      </Card>
    </div>
  );
}
