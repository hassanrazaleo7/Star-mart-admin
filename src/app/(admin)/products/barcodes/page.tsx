import type { Metadata } from "next";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatPKR } from "@/lib/money";
import { symbologyFor } from "@/lib/products/barcode";
import { BARCODES_PAGE_SIZE, listBarcodes, listCategories } from "@/lib/products/queries";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Barcodes" };

const SHOW = ["assigned", "missing", "all"] as const;

export default async function BarcodesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const raw = await searchParams;
  const showRaw = firstParam(raw.show);
  const params = {
    q: firstParam(raw.q)?.trim() ?? "",
    category: /^[0-9a-f-]{36}$/i.test(firstParam(raw.category) ?? "") ? firstParam(raw.category) : "",
    show: (SHOW as readonly string[]).includes(showRaw ?? "") ? (showRaw as (typeof SHOW)[number]) : "assigned",
    page: Math.max(1, Number(firstParam(raw.page) ?? 1) || 1),
  };
  const [result, categories] = await Promise.all([listBarcodes({ ...params, category: params.category || undefined }), listCategories()]);
  const manager = isManager(user.role);
  const pageIds = result.rows.filter((r) => r.barcode).map((r) => r.id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Barcodes</h1>
          <p className="text-sm text-muted-foreground">{result.assigned} product{result.assigned === 1 ? "" : "s"} with a barcode · {result.missing} without. Download a PNG or SVG of any barcode, or print labels.</p>
        </div>
        {pageIds.length ? <Button variant="outline" nativeButton={false} render={<Link href={`/print/labels?ids=${pageIds.join(",")}`} target="_blank" prefetch={false} />}><PrinterIcon /> Print labels for this page</Button> : null}
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={params.q} placeholder="Search name, SKU or barcode" className="max-w-xs" data-scanner-ignore />
        <NativeSelect name="category" defaultValue={params.category} aria-label="Category">
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect name="show" defaultValue={params.show} aria-label="Show">
          <NativeSelectOption value="assigned">With barcode</NativeSelectOption>
          <NativeSelectOption value="missing">Missing barcode</NativeSelectOption>
          <NativeSelectOption value="all">All products</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>{params.show === "missing" ? "Products without a barcode" : "Assigned barcodes"}</CardTitle>
          <CardDescription>EAN-13 codes are 13 digits with a valid check digit; anything else renders as Code 128. PNG downloads are 3× scale, suitable for printing.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead className="w-56">Barcode</TableHead><TableHead>Product</TableHead><TableHead>Code</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Download</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{params.show === "missing" ? "Every product has a barcode." : "No barcodes match."}</TableCell></TableRow> : null}
              {result.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.barcode ? (
                      // eslint-disable-next-line @next/next/no-img-element -- authenticated route; next/image cannot forward the session cookie
                      <img src={`/api/barcode/${p.id}?format=svg&scale=1&height=10`} alt={`Barcode ${p.barcode}`} className="h-16 w-auto max-w-52 bg-white" loading="lazy" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No barcode</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/products/${p.id}/edit`} className="font-medium hover:underline">{p.name}</Link>
                    <div className="font-mono text-xs text-muted-foreground">{p.sku}{p.categoryName ? ` · ${p.categoryName}` : ""}</div>
                    {p.status !== "active" ? <Badge variant="secondary" className="mt-1">{p.status}</Badge> : null}
                  </TableCell>
                  <TableCell>
                    {p.barcode ? <><span className="font-mono">{p.barcode}</span><div className="text-xs text-muted-foreground">{symbologyFor(p.barcode) === "ean13" ? "EAN-13" : "Code 128"}</div></> : manager ? <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/products/${p.id}/edit`} />}>Assign</Button> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPKR(p.pricePaisa)}</TableCell>
                  <TableCell className="text-right">
                    {p.barcode ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/api/barcode/${p.id}?format=png&scale=3&height=14&download=1`} prefetch={false} download />}><DownloadIcon /> PNG</Button>
                        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/api/barcode/${p.id}?format=svg&scale=3&height=14&download=1`} prefetch={false} download />}>SVG</Button>
                        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/print/labels?ids=${p.id}`} target="_blank" prefetch={false} />} aria-label={`Print label for ${p.name}`}><PrinterIcon /></Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={BARCODES_PAGE_SIZE} basePath="/products/barcodes" params={{ q: params.q, category: params.category, show: params.show }} />
        </CardContent>
      </Card>
    </div>
  );
}
