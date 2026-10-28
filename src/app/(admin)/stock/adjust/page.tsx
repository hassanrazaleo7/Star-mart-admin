import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { productBrief } from "@/lib/stock/queries";
import { searchProductsAction } from "../../products/actions";
import { AdjustForm } from "./adjust-form";

export const metadata: Metadata = { title: "Adjust stock" };

export default async function AdjustStockPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(ROLE_GROUPS.managers);
  const raw = await searchParams;
  const id = firstParam(raw.product);
  const product = id && /^[0-9a-f-]{36}$/i.test(id) ? await productBrief(id) : null;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Adjust stock</h1>
        <p className="text-sm text-muted-foreground">Record damaged, expired or miscounted items. Sales and purchases book stock automatically.</p>
      </div>
      <AdjustForm initialProduct={product} search={searchProductsAction} />
    </div>
  );
}
