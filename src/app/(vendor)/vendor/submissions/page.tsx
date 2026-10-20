import type { Metadata } from "next";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireVendor } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { listSubmissions, PAGE_SIZE } from "@/lib/suppliers/queries";

export const metadata: Metadata = { title: "Submissions" };

export default async function VendorSubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const ctx = await requireVendor();
  const page = Math.max(1, Number(firstParam(raw.page) ?? 1) || 1);
  const result = await listSubmissions({ supplier: ctx.supplierId, page });
  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Submissions</h1>
          <p className="text-sm text-muted-foreground">Product proposals and reported deliveries, with the store&apos;s decision.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/vendor/submit/product" />}>Propose a product</Button>
          <Button nativeButton={false} render={<Link href="/vendor/submit/supply" />}>Report a delivery</Button>
        </div>
      </div>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Kind</TableHead><TableHead>Summary</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead>Store note</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No submissions yet.</TableCell></TableRow> : null}
              {result.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.number}</TableCell>
                  <TableCell><Badge variant="outline">{s.kind}</Badge></TableCell>
                  <TableCell>{s.payload.kind === "product" ? s.payload.name : `${s.payload.items.length} line${s.payload.items.length === 1 ? "" : "s"}${s.payload.invoiceRef ? ` · Inv. ${s.payload.invoiceRef}` : ""}`}</TableCell>
                  <TableCell>{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell><Badge variant={s.status === "pending" ? "default" : s.status === "approved" ? "outline" : "secondary"}>{s.status}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate" title={s.reviewNote ?? undefined}>{s.reviewNote ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={PAGE_SIZE} basePath="/vendor/submissions" params={{}} />
        </CardContent>
      </Card>
    </div>
  );
}
