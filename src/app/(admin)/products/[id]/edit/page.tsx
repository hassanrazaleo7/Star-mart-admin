import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { requireRole } from "@/lib/auth/session";
import { BatchTable } from "@/components/stock/batch-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { formatQty } from "@/lib/format";
import { getProduct, listCategories, listSupplierOptions } from "@/lib/products/queries";
import { storeToday } from "@/lib/stock/batches";
import { listBatches } from "@/lib/stock/expiry-queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { ProductForm } from "../../product-form";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(ROLE_GROUPS.managers);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [product, categories, suppliers, settings] = await Promise.all([getProduct(id), listCategories(true), listSupplierOptions(), getSettings()]);
  if (!product) notFound();
  const today = storeToday(settings.store.timezone);
  const [openBatches, history] = await Promise.all([
    listBatches({ view: "open", productId: id, today, warningDays: settings.stock.expiryWarningDays, pageSize: 200 }),
    listBatches({ view: "all", productId: id, today, warningDays: settings.stock.expiryWarningDays, pageSize: 20 }),
  ]);
  const emptied = history.rows.filter((b) => b.qtyRemaining <= 0);
  const unbatched = Math.round((product.stockQty - openBatches.totals.qty) * 1000) / 1000;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{product.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">{product.sku}</p>
      </div>
      <ProductForm product={product} categories={categories} suppliers={suppliers} blobEnabled={env.blobConfigured} defaultTaxBps={settings.tax.defaultRateBps} defaultReorderLevel={settings.stock.defaultReorderLevel} defaultExpiryWarningDays={settings.stock.expiryWarningDays} />
      <Card id="batches" className="scroll-mt-20">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">Batches {product.tracksExpiry ? <Badge variant="outline">Tracks expiry</Badge> : null}</CardTitle>
              <CardDescription>
                {formatQty(openBatches.totals.qty, product.unit)} in {openBatches.total} open batch{openBatches.total === 1 ? "" : "es"}. Sales take the earliest expiry first.
                {unbatched !== 0 ? ` ${formatQty(unbatched, product.unit)} on hand is not in any batch (stock sold below zero or recorded before batches).` : ""}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/stock/adjust?product=${product.id}`} />}>Adjust stock</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <BatchTable rows={openBatches.rows} today={today} warningDays={settings.stock.expiryWarningDays} hideProduct canManage redirectTo={`/products/${product.id}/edit`} emptyText="No stock in batches." />
          {emptied.length ? (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Recent emptied batches ({emptied.length})</summary>
              <div className="pt-3"><BatchTable rows={emptied} today={today} warningDays={settings.stock.expiryWarningDays} hideProduct canManage={false} redirectTo={`/products/${product.id}/edit`} /></div>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
