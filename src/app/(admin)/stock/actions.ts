"use server";

import { scheduleEmailWork } from "@/lib/email/schedule";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { products, stockBatches } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { isGuardFailure } from "@/lib/db-errors";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { batchInflowItems, fefoOutflowItems, storeToday } from "@/lib/stock/batches";
import { applyStockMovements } from "@/lib/stock/movements";
import { firstIssue } from "@/lib/validation/common";
import { batchEditSchema, expiryWriteOffSchema, stockAdjustmentSchema, stockTakeSchema } from "@/lib/validation/suppliers";

export type StockFormState = { error: string | null };

export async function createStockAdjustmentAction(_previous: StockFormState, formData: FormData): Promise<StockFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = stockAdjustmentSchema.safeParse({
    productId: formData.get("productId"),
    direction: formData.get("direction"),
    qty: formData.get("qty"),
    reason: formData.get("reason"),
    note: formData.get("note"),
    batchId: formData.get("batchId"),
    batchCode: formData.get("batchCode"),
    expiry: formData.get("expiry"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const product = await db.query.products.findFirst({ where: eq(products.id, parsed.data.productId) });
  if (!product) return { error: "Product not found." };
  if (!product.allowFractional && !Number.isInteger(parsed.data.qty)) return { error: `${product.name} is counted in whole units.` };
  const { direction, qty, reason, note, batchId } = parsed.data;
  if (direction === "in" && product.tracksExpiry && !parsed.data.expiry) return { error: `${product.name} tracks expiry: enter the expiry date of the units you are adding.` };
  const delta = direction === "in" ? qty : -qty;
  const settings = await getSettings();
  const base = { kind: "adjustment" as const, refType: "adjustment", refId: null, unitCostPaisa: product.costPaisa, reason, note, createdBy: ctx.user.id };
  let statements: BatchItem<"pg">[];
  if (direction === "in") {
    statements = batchInflowItems({ productId: product.id, qty, source: "adjustment", batchCode: parsed.data.batchCode, expiry: parsed.data.expiry, unitCostPaisa: product.costPaisa, supplierId: product.supplierId, createdBy: ctx.user.id }, base).items;
  } else if (batchId) {
    const [batch] = await db.select({ id: stockBatches.id, qtyRemaining: stockBatches.qtyRemaining, unitCostPaisa: stockBatches.unitCostPaisa }).from(stockBatches).where(and(eq(stockBatches.id, batchId), eq(stockBatches.productId, product.id))).limit(1);
    if (!batch) return { error: "That batch does not belong to this product." };
    if (batch.qtyRemaining < qty) return { error: `That batch only has ${batch.qtyRemaining} ${product.unit} left.` };
    statements = applyStockMovements([{ ...base, productId: product.id, qtyDelta: -qty, batchId, unitCostPaisa: batch.unitCostPaisa ?? product.costPaisa }], { guardNonNegative: true });
  } else {
    statements = await fefoOutflowItems([{ ...base, productId: product.id, qty }], { today: storeToday(settings.store.timezone), costFromBatch: true }, { guardNonNegative: true });
  }
  const meta = await getRequestMeta();
  try {
    const [first, ...rest] = statements;
    await db.batch([first, ...rest]);
  } catch (error) {
    if (isGuardFailure(error)) return { error: `Not enough stock: ${product.name} has ${product.stockQty} ${product.unit} on hand.` };
    throw error;
  }
  await audit("stock.adjusted", { ...meta, actorUserId: ctx.user.id, metadata: { productId: product.id, sku: product.sku, delta, reason, batchId: batchId ?? null, expiry: parsed.data.expiry } });
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
  const takeId = crypto.randomUUID();
  const settings = await getSettings();
  const statements: BatchItem<"pg">[] = [];
  const shortages = [];
  let adjustments = 0;
  for (const entry of parsed.data.entries) {
    const p = byId.get(entry.productId);
    if (!p) continue;
    if (!p.allowFractional && !Number.isInteger(entry.countedQty)) return { error: `${p.name} is counted in whole units.` };
    const delta = Math.round((entry.countedQty - p.stockQty) * 1000) / 1000;
    if (delta === 0) continue;
    adjustments++;
    const base = { productId: p.id, kind: "stock_take" as const, refType: "stock_take", refId: takeId, unitCostPaisa: p.costPaisa, reason: "count_correction" as const, note: parsed.data.note, createdBy: ctx.user.id };
    // Found units become an undated batch (set its expiry on the Expiry page); missing units leave earliest expiry first.
    if (delta > 0) statements.push(...batchInflowItems({ productId: p.id, qty: delta, source: "stock_take", unitCostPaisa: p.costPaisa, createdBy: ctx.user.id }, base).items);
    else shortages.push({ ...base, qty: -delta });
  }
  if (adjustments === 0) return { error: "Every counted quantity already matches the system. Nothing to commit." };
  statements.push(...(await fefoOutflowItems(shortages, { today: storeToday(settings.store.timezone), allowShortfall: true })));
  const [first, ...rest] = statements;
  try {
    await db.batch([first, ...rest]);
  } catch (error) {
    if (isGuardFailure(error)) return { error: "Stock changed while you were counting. Reload the count sheet and try again." };
    throw error;
  }
  const meta = await getRequestMeta();
  await audit("stock.take_committed", { ...meta, actorUserId: ctx.user.id, metadata: { batchId: takeId, adjustments } });
  revalidatePath("/stock");
  revalidatePath("/products");
  scheduleEmailWork({ lowStock: true });
  redirect(`/stock?status=stock_take_done`);
}

/** Corrects a batch's lot code or expiry date (e.g. dating the OPENING batch). */
export async function updateBatchAction(_previous: StockFormState, formData: FormData): Promise<StockFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = batchEditSchema.safeParse({ batchId: formData.get("batchId"), batchCode: formData.get("batchCode"), expiry: formData.get("expiry") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const [before] = await db.select({ productId: stockBatches.productId, batchCode: stockBatches.batchCode, expiry: stockBatches.expiry }).from(stockBatches).where(eq(stockBatches.id, parsed.data.batchId)).limit(1);
  if (!before) return { error: "Batch not found." };
  // A new date may need a fresh alert, so the alert markers are reset.
  await db
    .update(stockBatches)
    .set({ batchCode: parsed.data.batchCode, expiry: parsed.data.expiry, soonAlertedAt: null, expiredAlertedAt: null, updatedAt: sql`now()` })
    .where(eq(stockBatches.id, parsed.data.batchId));
  const meta = await getRequestMeta();
  await audit("stock.batch_updated", { ...meta, actorUserId: ctx.user.id, metadata: { batchId: parsed.data.batchId, productId: before.productId, from: { batchCode: before.batchCode, expiry: before.expiry }, to: { batchCode: parsed.data.batchCode, expiry: parsed.data.expiry } } });
  revalidatePath("/stock/expiry");
  revalidatePath(`/products/${before.productId}/edit`);
  return { error: null };
}

/** Writes off everything left in the selected batches as expired stock. */
export async function writeOffBatchesAction(_previous: StockFormState, formData: FormData): Promise<StockFormState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = expiryWriteOffSchema.safeParse({ batchIds: formData.getAll("batchId"), note: formData.get("note") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const batches = await db
    .select({ id: stockBatches.id, productId: stockBatches.productId, qtyRemaining: stockBatches.qtyRemaining, unitCostPaisa: stockBatches.unitCostPaisa, expiry: stockBatches.expiry, costPaisa: products.costPaisa })
    .from(stockBatches)
    .innerJoin(products, eq(products.id, stockBatches.productId))
    .where(and(inArray(stockBatches.id, parsed.data.batchIds), gt(stockBatches.qtyRemaining, 0)));
  if (!batches.length) return { error: "Those batches are already empty." };
  const writeOffId = crypto.randomUUID();
  const statements: BatchItem<"pg">[] = [
    ...applyStockMovements(
      batches.map((b) => ({
        productId: b.productId,
        qtyDelta: -b.qtyRemaining,
        batchId: b.id,
        kind: "adjustment" as const,
        refType: "expiry_writeoff",
        refId: writeOffId,
        unitCostPaisa: b.unitCostPaisa ?? b.costPaisa,
        reason: "expired" as const,
        note: parsed.data.note ?? (b.expiry ? `Expired ${b.expiry}` : "Written off"),
        createdBy: ctx.user.id,
      })),
      { guardNonNegative: true },
    ),
    db.update(stockBatches).set({ writtenOffAt: sql`now()` }).where(inArray(stockBatches.id, batches.map((b) => b.id))),
  ];
  try {
    const [first, ...rest] = statements;
    await db.batch([first, ...rest]);
  } catch (error) {
    if (isGuardFailure(error)) return { error: "Stock changed while writing off (a batch was sold from). Reload and try again." };
    throw error;
  }
  const valuePaisa = batches.reduce((s, b) => s + Math.round(b.qtyRemaining * (b.unitCostPaisa ?? b.costPaisa)), 0);
  const meta = await getRequestMeta();
  await audit("stock.expiry_writeoff", { ...meta, actorUserId: ctx.user.id, metadata: { writeOffId, batches: batches.length, valuePaisa } });
  revalidatePath("/stock");
  revalidatePath("/stock/expiry");
  revalidatePath("/products");
  scheduleEmailWork({ lowStock: true });
  const back = String(formData.get("redirectTo") ?? "");
  redirect(`${back.startsWith("/") && !back.startsWith("//") ? back.split("?")[0] : "/stock/expiry"}?status=batches_written_off`);
}

export type BatchOption = { id: string; batchCode: string | null; expiry: string | null; qtyRemaining: number };

/** Open batches of one product, earliest expiry first (adjust form picker). */
export async function listOpenBatchesAction(productId: string): Promise<BatchOption[]> {
  await requireRole(ROLE_GROUPS.managers);
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return [];
  return db
    .select({ id: stockBatches.id, batchCode: stockBatches.batchCode, expiry: stockBatches.expiry, qtyRemaining: stockBatches.qtyRemaining })
    .from(stockBatches)
    .where(and(eq(stockBatches.productId, productId), gt(stockBatches.qtyRemaining, 0)))
    .orderBy(sql`${stockBatches.expiry} asc nulls last`, stockBatches.createdAt);
}
