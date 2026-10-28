import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportPage() {
  await requireRole(ROLE_GROUPS.managers);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Import products</h1>
        <p className="text-sm text-muted-foreground">Upload a CSV; rows are matched by SKU (existing products are updated, new ones created).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>CSV file</CardTitle>
          <CardDescription>
            Columns: sku, name, barcode, category, brand, unit, allow_fractional, cost, price, tax_rate_percent, reorder_level, reorder_qty, supplier, status, stock_qty, description, tracks_expiry, shelf_life_days, initial_expiry.{" "}
            <a href="/api/products/export?template=1" className="underline">
              Download template
            </a>
            . Opening stock (stock_qty) is only applied to new products, as one batch expiring on initial_expiry (YYYY-MM-DD). Leave tracks_expiry or shelf_life_days blank to keep the current value of an existing product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>
    </div>
  );
}
