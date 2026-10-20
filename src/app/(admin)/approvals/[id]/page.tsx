import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime, formatQty } from "@/lib/format";
import { formatPKR, lineTotal } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { getSubmission, productNamesFor } from "@/lib/suppliers/queries";
import { listCategoryOptions } from "../actions";
import { ApproveProductForm, ApproveSupplyForm, RejectForm } from "./review-forms";

export const metadata: Metadata = { title: "Review submission" };

export default async function ReviewSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(ROLE_GROUPS.managers);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const submission = await getSubmission(id);
  if (!submission) notFound();
  const [categories, settings] = await Promise.all([listCategoryOptions(), getSettings()]);
  const pending = submission.status === "pending";
  const payload = submission.payload;
  const names = payload.kind === "supply" ? await productNamesFor(payload.items.map((i) => i.productId)) : new Map();

  return (
    <div className="grid gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">{submission.number}</h1>
          <Badge variant="outline">{submission.kind}</Badge>
          <Badge variant={pending ? "default" : submission.status === "approved" ? "outline" : "secondary"}>{submission.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          From <Link href={`/suppliers/${submission.supplierId}`} className="hover:underline">{submission.supplier.name}</Link>
          {submission.submitter ? ` (${submission.submitter.name})` : ""} · {formatDateTime(submission.createdAt)}
          {submission.reviewedAt ? ` · reviewed ${formatDateTime(submission.reviewedAt)}` : ""}
        </p>
        {submission.reviewNote ? <p className="mt-1 text-sm">Note: {submission.reviewNote}</p> : null}
      </div>

      {payload.kind === "product" ? (
        <Card>
          <CardHeader><CardTitle>Proposed product</CardTitle><CardDescription>{pending ? "Check and adjust the details, then approve to add it to the catalogue." : "Details as submitted."}</CardDescription></CardHeader>
          <CardContent>
            {payload.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={payload.imageUrl} alt="" className="mb-4 size-32 rounded-lg border object-cover" />
            ) : null}
            {payload.note ? <p className="mb-4 text-sm text-muted-foreground">Supplier note: {payload.note}</p> : null}
            {pending ? (
              <ApproveProductForm submissionId={submission.id} payload={payload} categories={categories} defaultReorderLevel={settings.stock.defaultReorderLevel} />
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Name</dt><dd>{payload.name}</dd></div>
                <div><dt className="text-muted-foreground">SKU / barcode</dt><dd className="font-mono">{[payload.sku, payload.barcode].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Cost / suggested price</dt><dd>{formatPKR(payload.costPaisa)} / {formatPKR(payload.suggestedPricePaisa)}</dd></div>
                <div><dt className="text-muted-foreground">Unit</dt><dd>{payload.unit}</dd></div>
                {submission.resultProductId ? <div className="sm:col-span-2"><Link href={`/products/${submission.resultProductId}/edit`} className="underline">Open created product</Link></div> : null}
              </dl>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Supplied quantities</CardTitle><CardDescription>{payload.invoiceRef ? `Supplier invoice ${payload.invoiceRef}. ` : ""}{pending ? "Approving creates a received purchase and books the stock." : ""}</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            {payload.note ? <p className="text-sm text-muted-foreground">Supplier note: {payload.note}</p> : null}
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit cost</TableHead><TableHead className="text-right">Line total</TableHead></TableRow></TableHeader>
              <TableBody>
                {payload.items.map((i, idx) => {
                  const p = names.get(i.productId);
                  return (
                    <TableRow key={idx}>
                      <TableCell>{p ? <>{p.name}<div className="font-mono text-xs text-muted-foreground">{p.sku}</div></> : <span className="text-destructive">Unknown product</span>}</TableCell>
                      <TableCell className="text-right">{formatQty(i.qty, p?.unit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(i.unitCostPaisa)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(lineTotal(i.unitCostPaisa, i.qty))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {submission.resultPurchaseId ? <Link href={`/purchases/${submission.resultPurchaseId}`} className="text-sm underline">Open created purchase</Link> : null}
            {pending ? <ApproveSupplyForm submissionId={submission.id} /> : null}
          </CardContent>
        </Card>
      )}

      {pending ? <div><RejectForm submissionId={submission.id} /></div> : null}
    </div>
  );
}
