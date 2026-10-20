import type { Metadata } from "next";
import { requireVendor } from "@/lib/auth/session";
import { lookupVendorBarcodeAction, searchVendorProductsAction } from "../../actions";
import { SubmitSupplyForm } from "./submit-supply-form";

export const metadata: Metadata = { title: "Report a delivery" };

export default async function SubmitSupplyPage() {
  await requireVendor();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Report a delivery</h1>
        <p className="text-sm text-muted-foreground">Tell the store what you delivered and at what price; stock updates once they approve it.</p>
      </div>
      <SubmitSupplyForm search={searchVendorProductsAction} lookupBarcode={lookupVendorBarcodeAction} />
    </div>
  );
}
