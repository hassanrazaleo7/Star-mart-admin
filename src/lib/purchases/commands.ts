import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { products, purchaseItems, purchases, supplierPayments, supplierSubmissions } from "@/db/schema";
import { ANCHOR, guarded } from "@/lib/db/guarded";
import { nextDocumentNumber } from "@/lib/documents";
import { lineTotal } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { batchInflowItems, storeToday } from "@/lib/stock/batches";
import { addDays } from "@/lib/stock/expiry";
import type { PurchaseLine } from "@/lib/validation/suppliers";

export class PurchaseError extends Error {}

export type PricedLine = PurchaseLine & { lineTotalPaisa: number; itemId: string };

export function priceLines(lines: PurchaseLine[]): { lines: PricedLine[]; subtotalPaisa: number } {
  const priced = lines.map((l) => ({ ...l, lineTotalPaisa: lineTotal(l.unitCostPaisa, l.qty), itemId: crypto.randomUUID() }));
  return { lines: priced, subtotalPaisa: priced.reduce((s, l) => s + l.lineTotalPaisa, 0) };
}

/**
 * Validates that every line's product exists (and optionally belongs to the supplier).
 * With `checkExpiry`, also applies assertLineExpiries.
 */
export async function loadLineProducts(lines: PurchaseLine[], supplierId?: string, checkExpiry?: { today: string; allowExpired?: boolean }) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const rows = await db
    .select({ id: products.id, name: products.name, supplierId: products.supplierId, status: products.status, allowFractional: products.allowFractional, tracksExpiry: products.tracksExpiry, shelfLifeDays: products.shelfLifeDays })
    .from(products)
    .where(inArray(products.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const line of lines) {
    const p = byId.get(line.productId);
    if (!p) throw new PurchaseError("A line refers to a product that no longer exists.");
    if (p.status === "archived") throw new PurchaseError(`${p.name} is archived.`);
    if (supplierId && p.supplierId !== supplierId) throw new PurchaseError(`${p.name} is not supplied by this supplier.`);
    if (!p.allowFractional && !Number.isInteger(line.qty)) throw new PurchaseError(`${p.name} is sold in whole units.`);
  }
  if (checkExpiry) assertLineExpiries(lines, byId, checkExpiry);
  return byId;
}

/**
 * Products that track expiry must carry an expiry date, and dates must not be in
 * the past (an expired lot can still be booked with `allowExpired`, e.g. to write it off).
 */
export function assertLineExpiries(lines: PurchaseLine[], byId: Map<string, { name: string; tracksExpiry: boolean }>, options: { today: string; allowExpired?: boolean }) {
  for (const line of lines) {
    const p = byId.get(line.productId);
    if (!p) continue;
    if (p.tracksExpiry && !line.expiry) throw new PurchaseError(`${p.name} tracks expiry: enter the expiry date of this lot.`);
    if (line.expiry && line.expiry < options.today && !options.allowExpired) throw new PurchaseError(`${p.name}: expiry ${line.expiry} is in the past.`);
  }
}

/** Fills a missing expiry from the product's shelf life (receive date + N days). */
export function withShelfLife<T extends PurchaseLine>(lines: T[], byId: Map<string, { shelfLifeDays: number | null }>, today: string): T[] {
  return lines.map((l) => {
    const days = byId.get(l.productId)?.shelfLifeDays;
    return !l.expiry && days ? { ...l, expiry: addDays(today, days) } : l;
  });
}

/** Statements that mark a draft purchase as received and book its stock. Fails the batch if it is not a draft. */
export function receiveStatements(purchaseId: string, supplierId: string, lines: PricedLine[], actorId: string): BatchItem<"pg">[] {
  return [
    guarded(
      sql`update ${purchases} set status = 'received', received_at = now() where ${purchases.id} = ${purchaseId} and ${purchases.status} = 'draft' returning ${purchases.id}`,
      sql`update ${purchases} set updated_at = ${ANCHOR} where ${purchases.id} = ${purchaseId}`,
    ),
    // One batch per line, carrying its lot code and expiry.
    ...lines.flatMap(
      (l) =>
        batchInflowItems(
          { productId: l.productId, qty: l.qty, source: "purchase", batchCode: l.batch, expiry: l.expiry, unitCostPaisa: l.unitCostPaisa, supplierId, purchaseItemId: l.itemId, createdBy: actorId },
          { kind: "purchase", refType: "purchase", refId: purchaseId, unitCostPaisa: l.unitCostPaisa, createdBy: actorId },
        ).items,
    ),
    // Last-cost policy: the latest purchase price becomes the product cost.
    ...lines.map((l) => db.update(products).set({ costPaisa: l.unitCostPaisa, updatedAt: sql`now()` }).where(eq(products.id, l.productId))),
  ];
}

export async function createPurchase(input: { supplierId: string; invoiceRef: string | null; notes: string | null; lines: PurchaseLine[]; receiveNow: boolean; allowExpired?: boolean }, actorId: string) {
  const settings = await getSettings();
  const today = storeToday(settings.store.timezone);
  const byId = await loadLineProducts(input.lines);
  // Shelf-life defaults and the expiry checks apply when stock is booked; a draft is completed on receive.
  const filled = input.receiveNow ? withShelfLife(input.lines, byId, today) : input.lines;
  if (input.receiveNow) assertLineExpiries(filled, byId, { today, allowExpired: input.allowExpired });
  const { lines, subtotalPaisa } = priceLines(filled);
  const number = await nextDocumentNumber("purchase", settings.numbering.purchase);
  const id = crypto.randomUUID();
  const statements: BatchItem<"pg">[] = [
    db.insert(purchases).values({ id, number, supplierId: input.supplierId, status: "draft", invoiceRef: input.invoiceRef, notes: input.notes, subtotalPaisa, totalPaisa: subtotalPaisa, createdBy: actorId }),
    db.insert(purchaseItems).values(lines.map((l) => ({ id: l.itemId, purchaseId: id, productId: l.productId, qty: l.qty, unitCostPaisa: l.unitCostPaisa, lineTotalPaisa: l.lineTotalPaisa, batch: l.batch, expiry: l.expiry }))),
    ...(input.receiveNow ? receiveStatements(id, input.supplierId, lines, actorId) : []),
  ];
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
  return { id, number, totalPaisa: subtotalPaisa };
}

export async function receivePurchase(purchaseId: string, actorId: string, options: { allowExpired?: boolean } = {}) {
  const [purchase] = await db.select({ supplierId: purchases.supplierId }).from(purchases).where(eq(purchases.id, purchaseId)).limit(1);
  if (!purchase) throw new PurchaseError("Purchase not found.");
  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
  if (!items.length) throw new PurchaseError("This purchase has no lines.");
  const settings = await getSettings();
  const today = storeToday(settings.store.timezone);
  const raw: PricedLine[] = items.map((i) => ({ itemId: i.id, productId: i.productId, qty: i.qty, unitCostPaisa: i.unitCostPaisa, batch: i.batch, expiry: i.expiry, lineTotalPaisa: i.lineTotalPaisa }));
  const rows = await db.select({ id: products.id, name: products.name, tracksExpiry: products.tracksExpiry, shelfLifeDays: products.shelfLifeDays }).from(products).where(inArray(products.id, [...new Set(raw.map((l) => l.productId))]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = withShelfLife(raw, byId, today);
  assertLineExpiries(lines, byId, { today, allowExpired: options.allowExpired });
  // Persist expiries filled in from shelf life so the purchase shows what was booked.
  const filled = lines.filter((l, i) => l.expiry !== raw[i].expiry);
  const [first, ...rest] = [
    ...receiveStatements(purchaseId, purchase.supplierId, lines, actorId),
    ...filled.map((l) => db.update(purchaseItems).set({ expiry: l.expiry }).where(eq(purchaseItems.id, l.itemId))),
  ];
  await db.batch([first, ...rest]);
}

export async function cancelPurchase(purchaseId: string) {
  const rows = await db.update(purchases).set({ status: "cancelled", updatedAt: sql`now()` }).where(and(eq(purchases.id, purchaseId), eq(purchases.status, "draft"))).returning({ id: purchases.id });
  if (!rows.length) throw new PurchaseError("Only draft purchases can be cancelled.");
}

export async function recordSupplierPayment(input: { supplierId: string; purchaseId: string | null; amountPaisa: number; method: "cash" | "bank_transfer" | "card" | "other"; reference: string | null; note: string | null; paidAt?: string }, actorId: string) {
  const paidAt = input.paidAt ? sql`${input.paidAt}::date` : sql`now()`;
  if (input.purchaseId) {
    await db.batch([
      guarded(
        sql`update ${purchases} set paid_paisa = paid_paisa + ${input.amountPaisa},
            payment_status = case when paid_paisa + ${input.amountPaisa} >= total_paisa then 'paid'::star_mart.pay_status else 'partial'::star_mart.pay_status end,
            updated_at = now()
            where ${purchases.id} = ${input.purchaseId} and ${purchases.supplierId} = ${input.supplierId}
              and ${purchases.status} = 'received' and paid_paisa + ${input.amountPaisa} <= total_paisa returning ${purchases.id}`,
        sql`insert into ${supplierPayments} (supplier_id, purchase_id, amount_paisa, method, reference, note, paid_at, created_by, created_at)
            values (${input.supplierId}, ${input.purchaseId}, ${input.amountPaisa}, ${input.method}, ${input.reference}, ${input.note}, ${paidAt}, ${actorId}, ${ANCHOR})`,
      ),
    ]);
    return;
  }
  await db.insert(supplierPayments).values({ supplierId: input.supplierId, purchaseId: null, amountPaisa: input.amountPaisa, method: input.method, reference: input.reference, note: input.note, paidAt: input.paidAt ? new Date(`${input.paidAt}T12:00:00Z`) : new Date(), createdBy: actorId });
}

/** Approves a supply submission by creating a received purchase in the same batch. */
export async function approveSupplySubmission(submissionId: string, supplierId: string, input: PurchaseLine[], invoiceRef: string | null, actorId: string, note: string | null, options: { allowExpired?: boolean } = {}) {
  const settings = await getSettings();
  const today = storeToday(settings.store.timezone);
  const byId = await loadLineProducts(input, supplierId);
  const lines = withShelfLife(input, byId, today);
  assertLineExpiries(lines, byId, { today, allowExpired: options.allowExpired });
  const priced = priceLines(lines);
  const number = await nextDocumentNumber("purchase", settings.numbering.purchase);
  const id = crypto.randomUUID();
  // Purchase first so the submission's result_purchase_id FK resolves; the guard
  // still rolls the whole batch back when the submission was already reviewed.
  await db.batch([
    db.insert(purchases).values({ id, number, supplierId, status: "draft", invoiceRef, notes: `From submission`, subtotalPaisa: priced.subtotalPaisa, totalPaisa: priced.subtotalPaisa, createdBy: actorId }),
    db.insert(purchaseItems).values(priced.lines.map((l) => ({ id: l.itemId, purchaseId: id, productId: l.productId, qty: l.qty, unitCostPaisa: l.unitCostPaisa, lineTotalPaisa: l.lineTotalPaisa, batch: l.batch, expiry: l.expiry }))),
    guarded(
      sql`update ${supplierSubmissions} set status = 'approved', reviewed_by = ${actorId}, reviewed_at = now(), review_note = ${note}, result_purchase_id = ${id}
          where ${supplierSubmissions.id} = ${submissionId} and ${supplierSubmissions.status} = 'pending' returning number`,
      sql`update ${supplierSubmissions} set number = (select number from g) where ${supplierSubmissions.id} = ${submissionId}`,
    ),
    ...receiveStatements(id, supplierId, priced.lines, actorId),
  ]);
  return { id, number };
}
