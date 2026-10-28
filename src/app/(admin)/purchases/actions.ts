"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { isGuardFailure } from "@/lib/db-errors";
import { cancelPurchase, createPurchase, PurchaseError, receivePurchase } from "@/lib/purchases/commands";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstIssue, uuidSchema } from "@/lib/validation/common";
import { purchaseInputSchema } from "@/lib/validation/suppliers";

export type PurchaseFormState = { error: string | null };

export async function createPurchaseAction(_previous: PurchaseFormState, formData: FormData): Promise<PurchaseFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = purchaseInputSchema.safeParse({
    supplierId: formData.get("supplierId"),
    invoiceRef: formData.get("invoiceRef"),
    notes: formData.get("notes"),
    receiveNow: formData.get("receiveNow"),
    allowExpired: formData.get("allowExpired"),
    lines: formData.get("lines"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const meta = await getRequestMeta();
  let result: { id: string; number: string; totalPaisa: number };
  try {
    result = await createPurchase({ ...parsed.data, lines: parsed.data.lines }, ctx.user.id);
  } catch (error) {
    if (error instanceof PurchaseError) return { error: error.message };
    throw error;
  }
  await audit("purchase.created", { ...meta, actorUserId: ctx.user.id, metadata: { purchaseId: result.id, number: result.number, totalPaisa: result.totalPaisa, received: parsed.data.receiveNow } });
  if (parsed.data.receiveNow) await audit("purchase.received", { ...meta, actorUserId: ctx.user.id, metadata: { purchaseId: result.id, number: result.number } });
  revalidatePath("/purchases");
  revalidatePath("/stock");
  redirect(`/purchases/${result.id}?status=${parsed.data.receiveNow ? "purchase_received" : "purchase_created"}`);
}

export async function receivePurchaseAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("purchaseId"));
  if (!id.success) redirect("/purchases");
  const meta = await getRequestMeta();
  try {
    await receivePurchase(id.data, ctx.user.id, { allowExpired: formData.get("allowExpired") === "on" });
  } catch (error) {
    if (error instanceof PurchaseError) redirect(`/purchases/${id.data}?error=${encodeURIComponent(error.message)}`);
    if (isGuardFailure(error)) redirect(`/purchases/${id.data}?status=purchase_not_draft`);
    throw error;
  }
  await audit("purchase.received", { ...meta, actorUserId: ctx.user.id, metadata: { purchaseId: id.data } });
  revalidatePath("/purchases");
  revalidatePath("/stock");
  redirect(`/purchases/${id.data}?status=purchase_received`);
}

export async function cancelPurchaseAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("purchaseId"));
  if (!id.success) redirect("/purchases");
  const meta = await getRequestMeta();
  try {
    await cancelPurchase(id.data);
  } catch (error) {
    if (error instanceof PurchaseError) redirect(`/purchases/${id.data}?status=purchase_not_draft`);
    throw error;
  }
  await audit("purchase.cancelled", { ...meta, actorUserId: ctx.user.id, metadata: { purchaseId: id.data } });
  revalidatePath("/purchases");
  redirect(`/purchases/${id.data}?status=purchase_cancelled`);
}
