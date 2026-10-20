import type { Metadata } from "next";
import { StatusToast } from "@/components/status-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { listCategories } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { CategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const categories = await listCategories();
  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div>
        <h1 className="font-heading text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-muted-foreground">Group products for filtering and reports.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All categories</CardTitle>
          <CardDescription>Rename inline; inactive categories are hidden from product forms.</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoriesManager categories={categories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))} />
        </CardContent>
      </Card>
    </div>
  );
}
