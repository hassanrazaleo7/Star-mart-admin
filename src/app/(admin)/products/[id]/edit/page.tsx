import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { requireRole } from "@/lib/auth/session";
import { getProduct, listCategories, listSupplierOptions } from "@/lib/products/queries";
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
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{product.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">{product.sku}</p>
      </div>
      <ProductForm product={product} categories={categories} suppliers={suppliers} blobEnabled={env.blobConfigured} defaultTaxBps={settings.tax.defaultRateBps} defaultReorderLevel={settings.stock.defaultReorderLevel} />
    </div>
  );
}
