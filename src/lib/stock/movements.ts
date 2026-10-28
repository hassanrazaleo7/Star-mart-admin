import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { products, stockBatches, stockMovements, type StockMovementKind } from "@/db/schema";
import { ANCHOR, guarded } from "@/lib/db/guarded";

export type StockMovementInput = {
  productId: string;
  qtyDelta: number; // positive = in, negative = out
  kind: StockMovementKind;
  refType?: string | null;
  refId?: string | null;
  unitCostPaisa?: number | null;
  reason?: "damaged" | "expired" | "count_correction" | "theft" | "other" | null;
  note?: string | null;
  createdBy?: string | null;
  /** Batch the units enter or leave; its qty_remaining moves with the product total. */
  batchId?: string | null;
};

export type ApplyOptions = {
  /** Reject movements that would take stock below zero (fails the whole batch). */
  guardNonNegative?: boolean;
};

/**
 * Returns batch items that insert the movement rows and update the cached
 * `products.stock_qty` (and `stock_batches.qty_remaining` when a batch is
 * given). Spread them into the caller's `db.batch([...])` so the business write
 * and the stock change commit together. No DB triggers.
 */
export function applyStockMovements(movements: StockMovementInput[], options: ApplyOptions = {}): BatchItem<"pg">[] {
  const items: BatchItem<"pg">[] = [];
  for (const m of movements) {
    if (!Number.isFinite(m.qtyDelta) || m.qtyDelta === 0) continue;
    const delta = Math.round(m.qtyDelta * 1000) / 1000;
    if (m.batchId) {
      // A batch never goes below zero, whatever the product-level policy: the
      // allocation was read before the batch ran, so a concurrent sale fails here.
      items.push(
        guarded(
          sql`update ${stockBatches} set qty_remaining = qty_remaining + ${delta}, updated_at = now()
              where ${stockBatches.id} = ${m.batchId} and ${stockBatches.productId} = ${m.productId} and qty_remaining + ${delta} >= 0 returning ${stockBatches.id}`,
          sql`update ${stockBatches} set updated_at = ${ANCHOR} where ${stockBatches.id} = ${m.batchId}`,
        ),
      );
    }
    if (options.guardNonNegative && delta < 0) {
      items.push(
        guarded(
          sql`update ${products} set stock_qty = stock_qty + ${delta}, updated_at = now()
              where ${products.id} = ${m.productId} and stock_qty + ${delta} >= 0 returning ${products.id}`,
          sql`insert into ${stockMovements} (product_id, qty_delta, kind, ref_type, ref_id, unit_cost_paisa, reason, batch_id, note, created_by, created_at)
              values (${m.productId}, ${delta}, ${m.kind}, ${m.refType ?? null}, ${m.refId ?? null}, ${m.unitCostPaisa ?? null}, ${m.reason ?? null}, ${m.batchId ?? null}, ${m.note ?? null}, ${m.createdBy ?? null}, ${ANCHOR})`,
        ),
      );
    } else {
      items.push(
        db.insert(stockMovements).values({
          productId: m.productId,
          qtyDelta: delta,
          kind: m.kind,
          refType: m.refType ?? null,
          refId: m.refId ?? null,
          unitCostPaisa: m.unitCostPaisa ?? null,
          reason: m.reason ?? null,
          batchId: m.batchId ?? null,
          note: m.note ?? null,
          createdBy: m.createdBy ?? null,
        }),
        db
          .update(products)
          .set({ stockQty: sql`${products.stockQty} + ${delta}`, updatedAt: sql`now()` })
          .where(eq(products.id, m.productId)),
      );
    }
  }
  return items;
}

/** Recomputes a product's cached balance from its ledger (reconciliation tool). */
export async function recomputeStockQty(productId: string): Promise<number> {
  const [row] = await db
    .update(products)
    .set({
      stockQty: sql`coalesce((select sum(${stockMovements.qtyDelta}) from ${stockMovements} where ${stockMovements.productId} = ${products.id}), 0)`,
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, productId))
    .returning({ stockQty: products.stockQty });
  return row?.stockQty ?? 0;
}
