"use server";

import { scheduleEmailWork } from "@/lib/email/schedule";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { products } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { isGuardFailure } from "@/lib/db-errors";
import { ROLE_GROUPS } from "@/lib/rbac";
import { applyStockMovements } from "@/lib/stock/movements";
import { firstIssue } from "@/lib/validation/common";
import { stockAdjustmentSchema, stockTakeSchema } from "@/lib/validation/suppliers";

export type StockFormState = { error: string | null };

export async function createStockAdjustmentAction(_previous: StockFormState, formData: FormData): Promise<StockFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = stockAdjustmentSchema.safeParse({
    productId: formData.get("productId"),
    direction: formData.get("direction"),
    qty: formData.get("qty"),
    reason: formData.get("reason"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const product = await db.query.products.findFirst({ where: eq(products.id, parsed.data.productId) });
  if (!product) return { error: "Product not found." };
  if (!product.allowFractional && !Number.isInteger(parsed.data.qty)) return { error: `${product.name} is counted in whole units.` };
  const delta = parsed.data.direction === "in" ? parsed.data.qty : -parsed.data.qty;
  const meta = await getRequestMeta();
  try {
    const [first, ...rest] = applyStockMovements(
      [{ productId: product.id, qtyDelta: delta, kind: "adjustment", refType: "adjustment", refId: null, unitCostPaisa: product.costPaisa, reason: parsed.data.reason, note: parsed.data.note, createdBy: ctx.user.id }],
      { guardNonNegative: true },
    );
    await db.batch([first, ...rest]);
  } catch (error) {
    if (isGuardFailure(error)) return { error: `Not enough stock: ${product.name} has ${product.stockQty} ${product.unit} on hand.` };
    throw error;
  }
  await audit("stock.adjusted", { ...meta, actorUserId: ctx.user.id, metadata: { productId: product.id, sku: product.sku, delta, reason: parsed.data.reason } });
  revalidatePath("/stock");
  revalidatePath("/products");
  scheduleEmailWork({ lowStock: true });
  redirect(`/stock/movements?product=${product.id}&status=stock_adjusted`);
}

export async function commitStockTakeAction(_previous: StockFormState, formData: FormData): Promise<StockFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = stockTakeSchema.safeParse({ entries: formData.get("entries"), note: formData.get("note") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const ids = parsed.data.entries.map((e) => e.productId);
  const rows = await db.select({ id: products.id, stockQty: products.stockQty, costPaisa: products.costPaisa, allowFractional: products.allowFractional, name: products.name }).from(products).where(inArray(products.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const batchId = crypto.randomUUID();
  const movements = [];
  for (const entry of parsed.data.entries) {
    const p = byId.get(entry.productId);
    if (!p) continue;
    if (!p.allowFractional && !Number.isInteger(entry.countedQty)) return { error: `${p.name} is counted in whole units.` };
    const delta = Math.round((entry.countedQty - p.stockQty) * 1000) / 1000;
    if (delta === 0) continue;
    movements.push({ productId: p.id, qtyDelta: delta, kind: "stock_take" as const, refType: "stock_take", refId: batchId, unitCostPaisa: p.costPaisa, reason: "count_correction" as const, note: parsed.data.note, createdBy: ctx.user.id });
  }
  if (movements.length === 0) return { error: "Every counted quantity already matches the system. Nothing to commit." };
  const statements = applyStockMovements(movements);
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
  const meta = await getRequestMeta();
  await audit("stock.take_committed", { ...meta, actorUserId: ctx.user.id, metadata: { batchId, adjustments: movements.length } });
  revalidatePath("/stock");
  revalidatePath("/products");
  scheduleEmailWork({ lowStock: true });
  redirect(`/stock?status=stock_take_done`);
}
