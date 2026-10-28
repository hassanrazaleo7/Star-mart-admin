import type { Metadata } from "next";
import { DownloadIcon, PlusIcon, TagsIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { listCategories, listProducts, listSupplierOptions, PRODUCTS_PAGE_SIZE } from "@/lib/products/queries";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { expiryBadgeVariant, expiryStatus } from "@/lib/stock/expiry";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { productListParamsSchema } from "@/lib/validation/products";
import { ProductRowActions } from "./product-row-actions";
import { ProductsToolbar } from "./products-toolbar";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const canManage = isManager(user.role);
  const parsed = productListParamsSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, firstParam(v)])));
  const params = parsed.success ? parsed.data : productListParamsSchema.parse({});
  const settings = await getSettings();
  const today = storeToday(settings.store.timezone);
  const [result, categories, suppliers] = await Promise.all([listProducts(params, { today, warningDays: settings.stock.expiryWarningDays }), listCategories(), listSupplierOptions()]);
  const symbol = settings.currency.symbol;
  const preserved = { q: params.q, category: params.category, supplier: params.supplier, status: params.status, low: params.low, expiry: params.expiry, sort: params.sort, dir: params.dir };

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status_msg) ?? firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">{result.total} product{result.total === 1 ? "" : "s"}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/products/categories" />}>
              <TagsIcon /> Categories
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/products/import" />}>
              <UploadIcon /> Import CSV
            </Button>
            <Button variant="outline" nativeButton={false} render={<a href={`/api/products/export?status=${params.status}`} />}>
              <DownloadIcon /> Export CSV
            </Button>
            <Button nativeButton={false} render={<Link href="/products/new" />}>
              <PlusIcon /> New product
            </Button>
          </div>
        ) : null}
      </div>
      <ProductsToolbar values={preserved} categories={categories} suppliers={suppliers} />
      <Card>
        <CardContent className="grid gap-4">
          {result.rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No products found</EmptyTitle>
                <EmptyDescription>Adjust the filters or add your first product.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((p) => {
                  const low = p.reorderLevel > 0 && p.stockQty <= p.reorderLevel;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-xs text-muted-foreground">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                              p.name.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <div className="flex flex-col">
                            <Link href={`/products/${p.id}/edit`} className="font-medium hover:underline">
                              {p.name}
                            </Link>
                            <span className="font-mono text-xs text-muted-foreground">
                              {p.sku}
                              {p.barcode ? ` · ${p.barcode}` : ""}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{p.categoryName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(p.pricePaisa, { symbol })}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.stockQty <= 0 ? "destructive" : low ? "outline" : "secondary"} className={low && p.stockQty > 0 ? "border-destructive text-destructive" : ""}>
                          {formatQty(p.stockQty, p.unit)}
                        </Badge>
                        {(() => {
                          const status = expiryStatus(p.nearestExpiry, today, p.expiryWarningDays ?? settings.stock.expiryWarningDays);
                          return status === "expired" || status === "expiring_soon" ? (
                            <div className="mt-1">
                              <Badge variant={expiryBadgeVariant(status)} title={`Earliest batch expires ${p.nearestExpiry}`}>{status === "expired" ? "Expired stock" : `Exp ${p.nearestExpiry}`}</Badge>
                            </div>
                          ) : null;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status === "active" ? "outline" : "secondary"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ProductRowActions product={{ id: p.id, name: p.name, status: p.status }} canManage={canManage} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={PRODUCTS_PAGE_SIZE} basePath="/products" params={preserved} />
        </CardContent>
      </Card>
    </div>
  );
}
