import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { products, purchaseItems, purchases, supplierPayments, supplierSubmissions } from "@/db/schema";
import { ANCHOR, guarded } from "@/lib/db/guarded";
import { nextDocumentNumber } from "@/lib/documents";
import { lineTotal } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { applyStockMovements } from "@/lib/stock/movements";
import type { PurchaseLine } from "@/lib/validation/suppliers";

export class PurchaseError extends Error {}

export type PricedLine = PurchaseLine & { lineTotalPaisa: number };

export function priceLines(lines: PurchaseLine[]): { lines: PricedLine[]; subtotalPaisa: number } {
  const priced = lines.map((l) => ({ ...l, lineTotalPaisa: lineTotal(l.unitCostPaisa, l.qty) }));
  return { lines: priced, subtotalPaisa: priced.reduce((s, l) => s + l.lineTotalPaisa, 0) };
}

/** Validates that every line's product exists (and optionally belongs to the supplier). */
export async function loadLineProducts(lines: PurchaseLine[], supplierId?: string) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const rows = await db
    .select({ id: products.id, name: products.name, supplierId: products.supplierId, status: products.status, allowFractional: products.allowFractional })
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
  return byId;
}

/** Statements that mark a draft purchase as received and book its stock. Fails the batch if it is not a draft. */
export function receiveStatements(purchaseId: string, lines: PricedLine[], actorId: string): BatchItem<"pg">[] {
  return [
    guarded(
      sql`update ${purchases} set status = 'received', received_at = now() where ${purchases.id} = ${purchaseId} and ${purchases.status} = 'draft' returning ${purchases.id}`,
      sql`update ${purchases} set updated_at = ${ANCHOR} where ${purchases.id} = ${purchaseId}`,
    ),
    ...applyStockMovements(
      lines.map((l) => ({ productId: l.productId, qtyDelta: l.qty, kind: "purchase" as const, refType: "purchase", refId: purchaseId, unitCostPaisa: l.unitCostPaisa, createdBy: actorId })),
    ),
    // Last-cost policy: the latest purchase price becomes the product cost.
    ...lines.map((l) => db.update(products).set({ costPaisa: l.unitCostPaisa, updatedAt: sql`now()` }).where(eq(products.id, l.productId))),
  ];
}

export async function createPurchase(input: { supplierId: string; invoiceRef: string | null; notes: string | null; lines: PurchaseLine[]; receiveNow: boolean }, actorId: string) {
  await loadLineProducts(input.lines);
  const { lines, subtotalPaisa } = priceLines(input.lines);
  const settings = await getSettings();
  const number = await nextDocumentNumber("purchase", settings.numbering.purchase);
  const id = crypto.randomUUID();
  const statements: BatchItem<"pg">[] = [
    db.insert(purchases).values({ id, number, supplierId: input.supplierId, status: "draft", invoiceRef: input.invoiceRef, notes: input.notes, subtotalPaisa, totalPaisa: subtotalPaisa, createdBy: actorId }),
    db.insert(purchaseItems).values(lines.map((l) => ({ purchaseId: id, productId: l.productId, qty: l.qty, unitCostPaisa: l.unitCostPaisa, lineTotalPaisa: l.lineTotalPaisa, batch: l.batch, expiry: l.expiry }))),
    ...(input.receiveNow ? receiveStatements(id, lines, actorId) : []),
  ];
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
  return { id, number, totalPaisa: subtotalPaisa };
}

export async function receivePurchase(purchaseId: string, actorId: string) {
  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
  if (!items.length) throw new PurchaseError("This purchase has no lines.");
  const lines: PricedLine[] = items.map((i) => ({ productId: i.productId, qty: i.qty, unitCostPaisa: i.unitCostPaisa, batch: i.batch, expiry: i.expiry, lineTotalPaisa: i.lineTotalPaisa }));
  const [first, ...rest] = receiveStatements(purchaseId, lines, actorId);
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
export async function approveSupplySubmission(submissionId: string, supplierId: string, lines: PurchaseLine[], invoiceRef: string | null, actorId: string, note: string | null) {
  await loadLineProducts(lines, supplierId);
  const priced = priceLines(lines);
  const settings = await getSettings();
  const number = await nextDocumentNumber("purchase", settings.numbering.purchase);
  const id = crypto.randomUUID();
  // Purchase first so the submission's result_purchase_id FK resolves; the guard
  // still rolls the whole batch back when the submission was already reviewed.
  await db.batch([
    db.insert(purchases).values({ id, number, supplierId, status: "draft", invoiceRef, notes: `From submission`, subtotalPaisa: priced.subtotalPaisa, totalPaisa: priced.subtotalPaisa, createdBy: actorId }),
    db.insert(purchaseItems).values(priced.lines.map((l) => ({ purchaseId: id, productId: l.productId, qty: l.qty, unitCostPaisa: l.unitCostPaisa, lineTotalPaisa: l.lineTotalPaisa, batch: l.batch, expiry: l.expiry }))),
    guarded(
      sql`update ${supplierSubmissions} set status = 'approved', reviewed_by = ${actorId}, reviewed_at = now(), review_note = ${note}, result_purchase_id = ${id}
          where ${supplierSubmissions.id} = ${submissionId} and ${supplierSubmissions.status} = 'pending' returning number`,
      sql`update ${supplierSubmissions} set number = (select number from g) where ${supplierSubmissions.id} = ${submissionId}`,
    ),
    ...receiveStatements(id, priced.lines, actorId),
  ]);
  return { id, number };
}
