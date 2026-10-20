import type { Metadata } from "next";
import { env } from "@/env";
import { requireVendor } from "@/lib/auth/session";
import { listCategories } from "@/lib/products/queries";
import { SubmitProductForm } from "./submit-product-form";

export const metadata: Metadata = { title: "Propose a product" };

export default async function SubmitProductPage() {
  await requireVendor();
  const categories = await listCategories(true);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Propose a product</h1>
        <p className="text-sm text-muted-foreground">The store reviews your proposal before it appears in the catalogue.</p>
      </div>
      <SubmitProductForm blobEnabled={env.blobConfigured} categories={categories.map((c) => c.name)} />
    </div>
  );
}
