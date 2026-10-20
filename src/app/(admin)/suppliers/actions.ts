"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { purchaseReturns, suppliers } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { isGuardFailure, isUniqueViolation } from "@/lib/db-errors";
import { findProductByBarcode, searchProducts, type ProductSearchRow } from "@/lib/products/queries";
import { PurchaseError, recordSupplierPayment } from "@/lib/purchases/commands";
import { ROLE_GROUPS } from "@/lib/rbac";
import { applyStockMovements } from "@/lib/stock/movements";
import { firstIssue, uuidSchema } from "@/lib/validation/common";
import { purchaseReturnSchema, supplierInputSchema, supplierPaymentSchema } from "@/lib/validation/suppliers";

export type FormState = { error: string | null; ok?: boolean };

export async function saveSupplierAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = supplierInputSchema.safeParse(Object.fromEntries(["id", "name", "contactName", "phone", "email", "address", "taxId", "paymentTerms", "notes"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...values } = parsed.data;
  const meta = await getRequestMeta();
  let supplierId = id;
  try {
    if (id) {
      await db.update(suppliers).set({ ...values, updatedAt: sql`now()` }).where(eq(suppliers.id, id));
      await audit("supplier.updated", { ...meta, actorUserId: ctx.user.id, metadata: { supplierId: id } });
    } else {
      const [row] = await db.insert(suppliers).values(values).returning({ id: suppliers.id });
      supplierId = row?.id;
      await audit("supplier.created", { ...meta, actorUserId: ctx.user.id, metadata: { supplierId, name: values.name } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "A supplier with that name already exists." };
    throw error;
  }
  revalidatePath("/suppliers");
  redirect(`/suppliers/${supplierId}?status=supplier_saved`);
}

export async function setSupplierActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("supplierId"));
  if (!id.success) redirect("/suppliers");
  const active = formData.get("active") === "true";
  await db.update(suppliers).set({ isActive: active, updatedAt: sql`now()` }).where(eq(suppliers.id, id.data));
  const meta = await getRequestMeta();
  await audit(active ? "supplier.enabled" : "supplier.disabled", { ...meta, actorUserId: ctx.user.id, metadata: { supplierId: id.data } });
  revalidatePath("/suppliers");
  redirect(`/suppliers/${id.data}?status=${active ? "supplier_enabled" : "supplier_disabled"}`);
}

export async function recordSupplierPaymentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = supplierPaymentSchema.safeParse({
    supplierId: formData.get("supplierId"),
    purchaseId: formData.get("purchaseId"),
    amountPaisa: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference"),
    note: formData.get("note"),
    paidAt: formData.get("paidAt"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const meta = await getRequestMeta();
  try {
    await recordSupplierPayment({ ...parsed.data, purchaseId: parsed.data.purchaseId ?? null }, ctx.user.id);
  } catch (error) {
    if (isGuardFailure(error)) return { error: "The amount exceeds what is still owed on that purchase, or the purchase is not received." };
    if (error instanceof PurchaseError) return { error: error.message };
    throw error;
  }
  await audit("supplier_payment.recorded", { ...meta, actorUserId: ctx.user.id, metadata: { supplierId: parsed.data.supplierId, purchaseId: parsed.data.purchaseId ?? null, amountPaisa: parsed.data.amountPaisa, method: parsed.data.method } });
  revalidatePath(`/suppliers/${parsed.data.supplierId}`);
  if (parsed.data.purchaseId) revalidatePath(`/purchases/${parsed.data.purchaseId}`);
  return { error: null, ok: true };
}

export async function recordPurchaseReturnAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = purchaseReturnSchema.safeParse({
    supplierId: formData.get("supplierId"),
    purchaseId: formData.get("purchaseId"),
    productId: formData.get("productId"),
    qty: formData.get("qty"),
    amountPaisa: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const meta = await getRequestMeta();
  try {
    await db.batch([
      db.insert(purchaseReturns).values({ supplierId: parsed.data.supplierId, purchaseId: parsed.data.purchaseId ?? null, productId: parsed.data.productId, qty: parsed.data.qty, amountPaisa: parsed.data.amountPaisa, reason: parsed.data.reason, createdBy: ctx.user.id }),
      ...applyStockMovements([{ productId: parsed.data.productId, qtyDelta: -parsed.data.qty, kind: "purchase_return", refType: "purchase_return", refId: parsed.data.purchaseId ?? null, createdBy: ctx.user.id, note: parsed.data.reason }], { guardNonNegative: true }),
    ]);
  } catch (error) {
    if (isGuardFailure(error)) return { error: "Not enough stock on hand to return that quantity." };
    throw error;
  }
  await audit("purchase_return.recorded", { ...meta, actorUserId: ctx.user.id, metadata: { supplierId: parsed.data.supplierId, productId: parsed.data.productId, qty: parsed.data.qty, amountPaisa: parsed.data.amountPaisa } });
  revalidatePath(`/suppliers/${parsed.data.supplierId}`);
  revalidatePath("/stock");
  return { error: null, ok: true };
}

export async function searchProductsForPurchaseAction(query: string): Promise<ProductSearchRow[]> {
  await requireRole(ROLE_GROUPS.managers);
  return searchProducts(query, { limit: 10, includeInactive: false });
}

export async function lookupBarcodeAction(code: string): Promise<ProductSearchRow | null> {
  await requireRole(ROLE_GROUPS.staff);
  return findProductByBarcode(code);
}
