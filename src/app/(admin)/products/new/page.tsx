import type { Metadata } from "next";
import { env } from "@/env";
import { requireRole } from "@/lib/auth/session";
import { listCategories, listSupplierOptions } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireRole(ROLE_GROUPS.managers);
  const [categories, suppliers, settings] = await Promise.all([listCategories(true), listSupplierOptions(), getSettings()]);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">New product</h1>
        <p className="text-sm text-muted-foreground">Simple product without variations.</p>
      </div>
      <ProductForm categories={categories} suppliers={suppliers} blobEnabled={env.blobConfigured} defaultTaxBps={settings.tax.defaultRateBps} defaultReorderLevel={settings.stock.defaultReorderLevel} />
    </div>
  );
}
