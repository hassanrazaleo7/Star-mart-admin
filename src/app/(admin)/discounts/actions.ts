"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { discountCodes } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db-errors";
import { validateDiscountCode, type DiscountCheck } from "@/lib/discounts/validate";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstIssue, uuidSchema } from "@/lib/validation/common";
import { discountSchema } from "@/lib/validation/customers";

export type DiscountFormState = { error: string | null; ok?: boolean };

export async function saveDiscountAction(_previous: DiscountFormState, formData: FormData): Promise<DiscountFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = discountSchema.safeParse(Object.fromEntries(["id", "code", "kind", "value", "minOrderPaisa", "maxDiscountPaisa", "startsAt", "endsAt", "usageLimit"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...values } = parsed.data;
  const meta = await getRequestMeta();
  try {
    if (id) {
      const rows = await db
        .update(discountCodes)
        .set({ ...values, updatedAt: sql`now()` })
        .where(sql`${discountCodes.id} = ${id} and (${discountCodes.usageLimit} is null or ${values.usageLimit ?? null}::int is null or ${values.usageLimit ?? null}::int >= ${discountCodes.usedCount})`)
        .returning({ id: discountCodes.id });
      if (!rows.length) return { error: "Usage limit cannot be lower than the number of times the code was already used." };
      await audit("discount.updated", { ...meta, actorUserId: ctx.user.id, metadata: { discountId: id, code: values.code } });
    } else {
      const [row] = await db.insert(discountCodes).values({ ...values, createdBy: ctx.user.id }).returning({ id: discountCodes.id });
      await audit("discount.created", { ...meta, actorUserId: ctx.user.id, metadata: { discountId: row?.id, code: values.code } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "That code already exists." };
    throw error;
  }
  revalidatePath("/discounts");
  return { error: null, ok: true };
}

export async function setDiscountActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const id = uuidSchema.safeParse(formData.get("discountId"));
  if (!id.success) redirect("/discounts");
  const active = formData.get("active") === "true";
  await db.update(discountCodes).set({ isActive: active, updatedAt: sql`now()` }).where(eq(discountCodes.id, id.data));
  const meta = await getRequestMeta();
  await audit(active ? "discount.enabled" : "discount.disabled", { ...meta, actorUserId: ctx.user.id, metadata: { discountId: id.data } });
  revalidatePath("/discounts");
  redirect(`/discounts?status=${active ? "discount_enabled" : "discount_disabled"}`);
}

/** Preview check used by the POS and order editor before the order is created. */
export async function checkDiscountCodeAction(code: string, subtotalPaisa: number): Promise<{ ok: true; code: string; kind: "percent" | "fixed"; value: number; maxDiscountPaisa: number | null; minOrderPaisa: number; discountPaisa: number } | { ok: false; message: string }> {
  await requireRole(ROLE_GROUPS.staff);
  const result: DiscountCheck = await validateDiscountCode(code, Math.max(0, Math.floor(subtotalPaisa)));
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, code: result.code.code, kind: result.code.kind, value: result.code.value, maxDiscountPaisa: result.code.maxDiscountPaisa, minOrderPaisa: result.code.minOrderPaisa, discountPaisa: result.discountPaisa };
}
