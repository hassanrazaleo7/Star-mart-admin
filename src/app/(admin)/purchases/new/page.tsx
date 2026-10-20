import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { listSupplierOptions } from "@/lib/products/queries";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { lookupBarcodeAction, searchProductsForPurchaseAction } from "../../suppliers/actions";
import { PurchaseForm } from "../purchase-form";

export const metadata: Metadata = { title: "New purchase" };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(ROLE_GROUPS.managers);
  const raw = await searchParams;
  const suppliers = await listSupplierOptions();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">New purchase</h1>
        <p className="text-sm text-muted-foreground">Record goods bought from a supplier.</p>
      </div>
      <PurchaseForm suppliers={suppliers} defaultSupplierId={firstParam(raw.supplier)} search={searchProductsForPurchaseAction} lookupBarcode={lookupBarcodeAction} />
    </div>
  );
}
