import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { products, stockBatches, stockMovements } from "@/db/schema";
import { localDate } from "@/lib/reports/range";
import { isExpired, planFefo } from "./expiry";
import { applyStockMovements, type ApplyOptions, type StockMovementInput } from "./movements";

// Batch (lot) tracking. Every unit that enters stock lands in a stock_batches row;
// every unit that leaves is taken from batches earliest expiry first (FEFO). The
// per-batch guard in applyStockMovements keeps qty_remaining from going negative.

export class StockAllocationError extends Error {}

export type BatchSource = "purchase" | "adjustment" | "stock_take" | "sale_return" | "initial" | "opening";

export function storeToday(timeZone: string, now = new Date()): string {
  return localDate(now, timeZone);
}

export type BatchInflow = {
  productId: string;
  qty: number;
  source: BatchSource;
  batchCode?: string | null;
  expiry?: string | null;
  unitCostPaisa?: number | null;
  supplierId?: string | null;
  purchaseItemId?: string | null;
  createdBy?: string | null;
};

/**
 * Creates a batch and books its units through a movement, so qty_remaining is
 * always the sum of its movements. `movement` carries the ledger fields.
 */
export function batchInflowItems(inflow: BatchInflow, movement: Omit<StockMovementInput, "productId" | "qtyDelta" | "batchId">): { batchId: string; items: BatchItem<"pg">[] } {
  const batchId = crypto.randomUUID();
  return {
    batchId,
    items: [
      db.insert(stockBatches).values({
        id: batchId,
        productId: inflow.productId,
        purchaseItemId: inflow.purchaseItemId ?? null,
        supplierId: inflow.supplierId ?? null,
        source: inflow.source,
        batchCode: inflow.batchCode ?? null,
        expiry: inflow.expiry ?? null,
        receivedQty: inflow.qty,
        qtyRemaining: 0,
        unitCostPaisa: inflow.unitCostPaisa ?? null,
        createdBy: inflow.createdBy ?? null,
      }),
      ...applyStockMovements([{ ...movement, productId: inflow.productId, qtyDelta: inflow.qty, batchId }]),
    ],
  };
}

type OpenBatch = { id: string; productId: string; expiry: string | null; qtyRemaining: number; unitCostPaisa: number | null; createdAt: Date };

async function loadOpenBatches(productIds: string[]): Promise<Map<string, OpenBatch[]>> {
  const map = new Map<string, OpenBatch[]>();
  if (!productIds.length) return map;
  const rows = await db
    .select({ id: stockBatches.id, productId: stockBatches.productId, expiry: stockBatches.expiry, qtyRemaining: stockBatches.qtyRemaining, unitCostPaisa: stockBatches.unitCostPaisa, createdAt: stockBatches.createdAt })
    .from(stockBatches)
    .where(and(inArray(stockBatches.productId, productIds), gt(stockBatches.qtyRemaining, 0)))
    .orderBy(asc(stockBatches.expiry), asc(stockBatches.createdAt));
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push(r);
    map.set(r.productId, list);
  }
  return map;
}

export type OutflowLine = Omit<StockMovementInput, "qtyDelta" | "batchId"> & { qty: number };

export type OutflowOptions = {
  today: string;
  /** Sales: skip expired batches and refuse to sell them (settings.stock.blockExpiredSales). */
  excludeExpired?: boolean;
  /** Negative-stock mode: an uncovered remainder is booked without a batch instead of failing. */
  allowShortfall?: boolean;
  /** Use each batch's own cost on the movement (write-offs, returns) instead of the line's. */
  costFromBatch?: boolean;
};

/**
 * Splits outgoing lines into per-batch movements, earliest expiry first.
 * Units not covered by batches (stock that predates a batch, or negative-stock
 * mode) are booked without a batch; the product-level guard still applies.
 */
export async function fefoOutflow(lines: OutflowLine[], options: OutflowOptions): Promise<StockMovementInput[]> {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  if (!productIds.length) return [];
  const [batchesByProduct, productRows] = await Promise.all([
    loadOpenBatches(productIds),
    db.select({ id: products.id, name: products.name, stockQty: products.stockQty }).from(products).where(inArray(products.id, productIds)),
  ]);
  // Units on hand that no open batch accounts for (shared across lines of one product).
  const unbatched = new Map<string, number>();
  const names = new Map<string, string>();
  for (const p of productRows) {
    const inBatches = (batchesByProduct.get(p.id) ?? []).reduce((s, b) => s + b.qtyRemaining, 0);
    unbatched.set(p.id, Math.max(0, Math.round((p.stockQty - inBatches) * 1000) / 1000));
    names.set(p.id, p.name);
  }

  const out: StockMovementInput[] = [];
  for (const { qty, ...line } of lines) {
    const batches = batchesByProduct.get(line.productId) ?? [];
    const { slices, remainder } = planFefo(batches, qty, { today: options.today, excludeExpired: !!options.excludeExpired });
    for (const s of slices) {
      out.push({ ...line, qtyDelta: -s.qty, batchId: s.batch.id, unitCostPaisa: options.costFromBatch ? (s.batch.unitCostPaisa ?? line.unitCostPaisa) : line.unitCostPaisa });
    }
    if (remainder > 0) {
      const free = unbatched.get(line.productId) ?? 0;
      if (remainder > free && !options.allowShortfall && options.excludeExpired) {
        const expiredQty = batches.filter((b) => isExpired(b.expiry, options.today)).reduce((s, b) => s + b.qtyRemaining, 0);
        if (expiredQty > 0) {
          const sellable = Math.round((qty - remainder + free) * 1000) / 1000;
          throw new StockAllocationError(
            `${names.get(line.productId) ?? "A product"}: only ${sellable} unexpired in stock (${expiredQty} expired). Write off the expired units on the Expiry page.`,
          );
        }
      }
      unbatched.set(line.productId, Math.max(0, free - remainder));
      out.push({ ...line, qtyDelta: -remainder, batchId: null });
    }
  }
  return out;
}

/** Convenience: fefoOutflow + applyStockMovements. */
export async function fefoOutflowItems(lines: OutflowLine[], options: OutflowOptions, apply: ApplyOptions = {}): Promise<BatchItem<"pg">[]> {
  return applyStockMovements(await fefoOutflow(lines, options), apply);
}

/**
 * Movements that put an order's sold units back into the batches they came
 * from. Units sold without a batch come back as a new undated batch.
 */
export async function orderReturnItems(orderId: string, actorId: string): Promise<BatchItem<"pg">[]> {
  const rows = await db
    .select({
      productId: stockMovements.productId,
      batchId: stockMovements.batchId,
      unitCostPaisa: sql<number | null>`max(${stockMovements.unitCostPaisa})`.mapWith((v) => (v == null ? null : Number(v))),
      qty: sql<number>`-sum(${stockMovements.qtyDelta})`.mapWith(Number),
    })
    .from(stockMovements)
    .where(and(eq(stockMovements.refType, "order"), eq(stockMovements.refId, orderId)))
    .groupBy(stockMovements.productId, stockMovements.batchId);
  const items: BatchItem<"pg">[] = [];
  for (const r of rows) {
    const qty = Math.round(r.qty * 1000) / 1000;
    if (qty <= 0) continue;
    const base = { kind: "sale_return" as const, refType: "order", refId: orderId, unitCostPaisa: r.unitCostPaisa, createdBy: actorId };
    if (r.batchId) items.push(...applyStockMovements([{ ...base, productId: r.productId, qtyDelta: qty, batchId: r.batchId }]));
    else items.push(...batchInflowItems({ productId: r.productId, qty, source: "sale_return", unitCostPaisa: r.unitCostPaisa, createdBy: actorId }, base).items);
  }
  return items;
}

/** Earliest open expiry per product (null when every open batch is undated). */
export async function nearestExpiries(productIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!productIds.length) return map;
  const rows = await db
    .select({ productId: stockBatches.productId, expiry: sql<string | null>`min(${stockBatches.expiry})` })
    .from(stockBatches)
    .where(and(inArray(stockBatches.productId, productIds), gt(stockBatches.qtyRemaining, 0)))
    .groupBy(stockBatches.productId);
  for (const r of rows) map.set(r.productId, r.expiry);
  return map;
}
