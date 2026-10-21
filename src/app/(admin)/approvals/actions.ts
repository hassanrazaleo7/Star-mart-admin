"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { categories, products, supplierSubmissions } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { describeImageUrlProblem } from "@/lib/blob-urls";
import { guarded } from "@/lib/db/guarded";
import { isGuardFailure, isUniqueViolation } from "@/lib/db-errors";
import { approveSupplySubmission, PurchaseError } from "@/lib/purchases/commands";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstIssue } from "@/lib/validation/common";
import { productInputSchema } from "@/lib/validation/products";
import { reviewSubmissionSchema } from "@/lib/validation/suppliers";

export type ReviewState = { error: string | null };

const submissionGuard = (submissionId: string, actorId: string, note: string | null, extra = sql``) =>
  guarded(
    sql`update ${supplierSubmissions} set status = 'approved', reviewed_by = ${actorId}, reviewed_at = now(), review_note = ${note} ${extra}
        where ${supplierSubmissions.id} = ${submissionId} and ${supplierSubmissions.status} = 'pending' returning number`,
    sql`update ${supplierSubmissions} set number = (select number from g) where ${supplierSubmissions.id} = ${submissionId}`,
  );

export async function approveProductSubmissionAction(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const review = reviewSubmissionSchema.safeParse({ submissionId: formData.get("submissionId"), note: formData.get("note") });
  if (!review.success) return { error: firstIssue(review.error) };
  const submission = await db.query.supplierSubmissions.findFirst({ where: eq(supplierSubmissions.id, review.data.submissionId) });
  if (!submission || submission.kind !== "product") return { error: "Submission not found." };
  if (submission.status !== "pending") return { error: "This submission was already reviewed." };

  const parsed = productInputSchema.safeParse({
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    name: formData.get("name"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    brand: formData.get("brand"),
    unit: formData.get("unit"),
    allowFractional: formData.get("allowFractional"),
    costPaisa: formData.get("costPaisa"),
    pricePaisa: formData.get("pricePaisa"),
    taxRateBps: formData.get("taxRateBps"),
    reorderLevel: formData.get("reorderLevel"),
    reorderQty: formData.get("reorderQty"),
    supplierId: submission.supplierId,
    imageUrl: formData.get("imageUrl"),
    imagePathname: formData.get("imagePathname"),
    status: "active",
    initialStock: "0",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  const imageProblem = describeImageUrlProblem(input.imageUrl);
  if (imageProblem) return { error: imageProblem };
  const productId = crypto.randomUUID();
  const meta = await getRequestMeta();
  try {
    // The product row goes first so the submission's result_product_id FK resolves;
    // the guard still rolls the whole batch back when the submission was already reviewed.
    await db.batch([
      db.insert(products).values({
        id: productId,
        sku: input.sku,
        barcode: input.barcode,
        name: input.name,
        description: input.description,
        categoryId: input.categoryId ?? null,
        brand: input.brand,
        unit: input.unit,
        allowFractional: input.allowFractional,
        costPaisa: input.costPaisa,
        pricePaisa: input.pricePaisa,
        taxRateBps: input.taxRateBps,
        reorderLevel: input.reorderLevel,
        reorderQty: input.reorderQty,
        supplierId: submission.supplierId,
        imageUrl: input.imageUrl ?? null,
        imagePathname: input.imageUrl ? input.imagePathname : null,
        status: "active",
        createdBy: ctx.user.id,
      }),
      submissionGuard(submission.id, ctx.user.id, review.data.note, sql`, result_product_id = ${productId}`),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "A product with that SKU or barcode already exists. Change it and approve again." };
    if (isGuardFailure(error)) return { error: "This submission was already reviewed." };
    throw error;
  }
  await audit("submission.approved", { ...meta, actorUserId: ctx.user.id, metadata: { submissionId: submission.id, kind: "product", productId } });
  revalidatePath("/approvals");
  revalidatePath("/products");
  redirect(`/approvals?status=submission_approved`);
}

export async function approveSupplySubmissionAction(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const review = reviewSubmissionSchema.safeParse({ submissionId: formData.get("submissionId"), note: formData.get("note") });
  if (!review.success) return { error: firstIssue(review.error) };
  const submission = await db.query.supplierSubmissions.findFirst({ where: eq(supplierSubmissions.id, review.data.submissionId) });
  if (!submission || submission.kind !== "supply" || submission.payload.kind !== "supply") return { error: "Submission not found." };
  if (submission.status !== "pending") return { error: "This submission was already reviewed." };
  const meta = await getRequestMeta();
  let result: { id: string; number: string };
  try {
    result = await approveSupplySubmission(
      submission.id,
      submission.supplierId,
      submission.payload.items.map((i) => ({ productId: i.productId, qty: i.qty, unitCostPaisa: i.unitCostPaisa, batch: null, expiry: null })),
      submission.payload.invoiceRef ?? null,
      ctx.user.id,
      review.data.note,
    );
  } catch (error) {
    if (error instanceof PurchaseError) return { error: error.message };
    if (isGuardFailure(error)) return { error: "This submission was already reviewed." };
    throw error;
  }
  await audit("submission.approved", { ...meta, actorUserId: ctx.user.id, metadata: { submissionId: submission.id, kind: "supply", purchaseId: result.id } });
  await audit("purchase.received", { ...meta, actorUserId: ctx.user.id, metadata: { purchaseId: result.id, number: result.number, fromSubmission: submission.id } });
  revalidatePath("/approvals");
  revalidatePath("/purchases");
  revalidatePath("/stock");
  redirect(`/purchases/${result.id}?status=submission_approved`);
}

export async function rejectSubmissionAction(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const review = reviewSubmissionSchema.safeParse({ submissionId: formData.get("submissionId"), note: formData.get("note") });
  if (!review.success) return { error: firstIssue(review.error) };
  const rows = await db
    .update(supplierSubmissions)
    .set({ status: "rejected", reviewedBy: ctx.user.id, reviewedAt: sql`now()`, reviewNote: review.data.note })
    .where(sql`${supplierSubmissions.id} = ${review.data.submissionId} and ${supplierSubmissions.status} = 'pending'`)
    .returning({ id: supplierSubmissions.id });
  if (!rows.length) return { error: "This submission was already reviewed." };
  const meta = await getRequestMeta();
  await audit("submission.rejected", { ...meta, actorUserId: ctx.user.id, metadata: { submissionId: review.data.submissionId, note: review.data.note } });
  revalidatePath("/approvals");
  redirect(`/approvals?status=submission_rejected`);
}

export async function listCategoryOptions() {
  return db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.isActive, true)).orderBy(categories.name);
}
