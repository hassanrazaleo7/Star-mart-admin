"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { supplierSubmissions, suppliers } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireVendor } from "@/lib/auth/session";
import { describeImageUrlProblem } from "@/lib/blob-urls";
import { nextDocumentNumber } from "@/lib/documents";
import { findProductByBarcode, searchProducts, type ProductSearchRow } from "@/lib/products/queries";
import { loadLineProducts, PurchaseError } from "@/lib/purchases/commands";
import { getSettings } from "@/lib/settings";
import { firstIssue } from "@/lib/validation/common";
import { submitProductSchema, submitSupplySchema, supplierInputSchema } from "@/lib/validation/suppliers";

export type VendorFormState = { error: string | null };

export async function submitProductAction(_previous: VendorFormState, formData: FormData): Promise<VendorFormState> {
  const ctx = await requireVendor();
  const parsed = submitProductSchema.safeParse(Object.fromEntries(["name", "sku", "barcode", "description", "unit", "allowFractional", "costPaisa", "suggestedPricePaisa", "taxRateBps", "categoryName", "imageUrl", "imagePathname", "note"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const imageProblem = describeImageUrlProblem(parsed.data.imageUrl);
  if (imageProblem) return { error: imageProblem };
  const settings = await getSettings();
  const number = await nextDocumentNumber("submission", settings.numbering.submission);
  const d = parsed.data;
  const [row] = await db
    .insert(supplierSubmissions)
    .values({
      number,
      supplierId: ctx.supplierId,
      kind: "product",
      submittedBy: ctx.user.id,
      payload: { kind: "product", name: d.name, sku: d.sku ?? undefined, barcode: d.barcode ?? undefined, description: d.description ?? undefined, unit: d.unit, allowFractional: d.allowFractional, costPaisa: d.costPaisa, suggestedPricePaisa: d.suggestedPricePaisa, taxRateBps: d.taxRateBps, categoryName: d.categoryName ?? undefined, imageUrl: d.imageUrl, imagePathname: d.imagePathname ?? undefined, note: d.note ?? undefined },
    })
    .returning({ id: supplierSubmissions.id });
  const meta = await getRequestMeta();
  await audit("submission.created", { ...meta, actorUserId: ctx.user.id, metadata: { submissionId: row?.id, kind: "product", supplierId: ctx.supplierId } });
  revalidatePath("/vendor/submissions");
  revalidatePath("/approvals");
  redirect("/vendor/submissions?status=submission_created");
}

export async function submitSupplyAction(_previous: VendorFormState, formData: FormData): Promise<VendorFormState> {
  const ctx = await requireVendor();
  const parsed = submitSupplySchema.safeParse({ invoiceRef: formData.get("invoiceRef"), note: formData.get("note"), lines: formData.get("lines") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await loadLineProducts(parsed.data.lines, ctx.supplierId);
  } catch (error) {
    if (error instanceof PurchaseError) return { error: error.message };
    throw error;
  }
  const settings = await getSettings();
  const number = await nextDocumentNumber("submission", settings.numbering.submission);
  const [row] = await db
    .insert(supplierSubmissions)
    .values({
      number,
      supplierId: ctx.supplierId,
      kind: "supply",
      submittedBy: ctx.user.id,
      payload: { kind: "supply", invoiceRef: parsed.data.invoiceRef ?? undefined, note: parsed.data.note ?? undefined, items: parsed.data.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCostPaisa: l.unitCostPaisa })) },
    })
    .returning({ id: supplierSubmissions.id });
  const meta = await getRequestMeta();
  await audit("submission.created", { ...meta, actorUserId: ctx.user.id, metadata: { submissionId: row?.id, kind: "supply", supplierId: ctx.supplierId, lines: parsed.data.lines.length } });
  revalidatePath("/vendor/submissions");
  revalidatePath("/approvals");
  redirect("/vendor/submissions?status=submission_created");
}

export async function updateSupplierProfileAction(_previous: VendorFormState, formData: FormData): Promise<VendorFormState> {
  const ctx = await requireVendor();
  const parsed = supplierInputSchema.safeParse({ id: ctx.supplierId, name: formData.get("name"), contactName: formData.get("contactName"), phone: formData.get("phone"), email: formData.get("email"), address: formData.get("address"), taxId: formData.get("taxId"), paymentTerms: formData.get("paymentTerms"), notes: null });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id: _id, notes: _notes, ...values } = parsed.data;
  void _id;
  void _notes;
  await db.update(suppliers).set({ ...values, updatedAt: sql`now()` }).where(eq(suppliers.id, ctx.supplierId));
  const meta = await getRequestMeta();
  await audit("vendor.profile_updated", { ...meta, actorUserId: ctx.user.id, metadata: { supplierId: ctx.supplierId } });
  revalidatePath("/vendor");
  redirect("/vendor/profile?status=profile_saved");
}

export async function searchVendorProductsAction(query: string): Promise<ProductSearchRow[]> {
  const ctx = await requireVendor();
  return searchProducts(query, { limit: 10, supplierId: ctx.supplierId });
}

export async function lookupVendorBarcodeAction(code: string): Promise<ProductSearchRow | null> {
  const ctx = await requireVendor();
  const row = await findProductByBarcode(code);
  if (!row) return null;
  const mine = await searchProducts(row.sku, { limit: 1, supplierId: ctx.supplierId });
  return mine.find((m) => m.id === row.id) ?? null;
}
