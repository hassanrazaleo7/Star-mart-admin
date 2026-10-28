import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { BatchTable } from "@/components/stock/batch-table";
import { StatusToast } from "@/components/status-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { requireRole } from "@/lib/auth/session";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { listCategories, listSupplierOptions } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { getSettings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { BATCHES_PAGE_SIZE, EXPIRY_VIEWS, expirySummary, listBatches, type ExpiryView } from "@/lib/stock/expiry-queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Expiry" };

const VIEW_LABEL: Record<ExpiryView, string> = { expired: "Expired", soon: "Expiring soon", missing: "Missing expiry", open: "All in stock", all: "All batches" };

export default async function ExpiryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const settings = await getSettings();
  const today = storeToday(settings.store.timezone);
  const warningDays = settings.stock.expiryWarningDays;
  const viewParam = firstParam(raw.view);
  const view: ExpiryView = (EXPIRY_VIEWS as readonly string[]).includes(viewParam ?? "") ? (viewParam as ExpiryView) : "expired";
  const params = { q: firstParam(raw.q) ?? "", category: firstParam(raw.category) ?? "", supplier: firstParam(raw.supplier) ?? "", page: Math.max(1, Number(firstParam(raw.page) ?? 1) || 1) };
  const [summary, result, categories, suppliers] = await Promise.all([
    expirySummary(today, warningDays),
    listBatches({ view, today, warningDays, q: params.q || undefined, category: params.category || undefined, supplier: params.supplier || undefined, page: params.page }),
    listCategories(),
    listSupplierOptions(),
  ]);
  const counts: Partial<Record<ExpiryView, number>> = { expired: summary.expiredBatches, soon: summary.soonBatches, missing: summary.missingBatches };
  const keep = { q: params.q, category: params.category, supplier: params.supplier };
  const tabHref = (v: ExpiryView) => `/stock/expiry?${new URLSearchParams(Object.fromEntries(Object.entries({ ...keep, view: v }).filter(([, val]) => val)))}`;

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Expiry</h1>
          <p className="text-sm text-muted-foreground">
            Batches by expiry date (today is {today}). Expiring soon means within {warningDays} days unless a product sets its own window.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={`/api/reports/expiry?view=${view}`} />}><DownloadIcon /> Export CSV</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/settings" />}>Expiry settings</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm"><CardHeader><CardDescription>Expired, still in stock</CardDescription><CardTitle className="text-destructive tabular-nums">{formatPKR(summary.expiredValuePaisa)}</CardTitle><CardDescription>{summary.expiredBatches} batches · {summary.productsExpired} products</CardDescription></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Expiring soon</CardDescription><CardTitle className="tabular-nums">{formatPKR(summary.soonValuePaisa)}</CardTitle><CardDescription>{summary.soonBatches} batches · {summary.productsSoon} products</CardDescription></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Perishable batches without a date</CardDescription><CardTitle className={summary.missingBatches ? "text-destructive" : undefined}>{summary.missingBatches}</CardTitle><CardDescription>Set the expiry with the pencil button</CardDescription></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Written off (last {summary.writtenOffSinceDays} days)</CardDescription><CardTitle className="tabular-nums">{formatPKR(summary.writtenOffValuePaisa)}</CardTitle><CardDescription>{formatQty(summary.writtenOffQty)} units</CardDescription></CardHeader></Card>
      </div>
      <nav className="flex flex-wrap gap-1 border-b" aria-label="Expiry views">
        {EXPIRY_VIEWS.map((v) => (
          <Link key={v} href={tabHref(v)} aria-current={v === view ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", v === view ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {VIEW_LABEL[v]}{counts[v] ? ` (${counts[v]})` : ""}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value={view} />
        <Input name="q" defaultValue={params.q} placeholder="Product, SKU, barcode or batch" className="max-w-xs" data-scanner-ignore />
        <NativeSelect name="category" defaultValue={params.category}><NativeSelectOption value="">All categories</NativeSelectOption>{categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect>
        <NativeSelect name="supplier" defaultValue={params.supplier}><NativeSelectOption value="">All suppliers</NativeSelectOption>{suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}</NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>{VIEW_LABEL[view]}</CardTitle>
          <CardDescription>{formatQty(result.totals.qty)} units · {formatPKR(result.totals.valuePaisa)} at cost</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <BatchTable
            rows={result.rows}
            today={today}
            warningDays={warningDays}
            canManage
            redirectTo={`/stock/expiry`}
            emptyText={view === "expired" ? "Nothing expired. 🎉" : "No batches match."}
          />
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={BATCHES_PAGE_SIZE} basePath="/stock/expiry" params={{ ...keep, view }} />
        </CardContent>
      </Card>
    </div>
  );
}
