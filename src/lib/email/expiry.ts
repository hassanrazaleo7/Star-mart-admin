import "server-only";
import { and, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockBatches } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { storeAlertRecipients } from "./low-stock";
import { enqueueEmail } from "./outbox";

const MAX_PER_DIGEST = 200;

/**
 * Stamps batches that newly entered the "expiring soon" window or newly expired
 * (each batch is reported once per stage) and queues one digest for the store.
 * Changing a batch's expiry clears its stamps, so a corrected date is re-reported.
 */
export async function checkExpiry(): Promise<{ batches: number; emails: number }> {
  const settings = await getSettings();
  if (!settings.stock.expiryEmails) return { batches: 0, emails: 0 };
  const today = storeToday(settings.store.timezone);
  const window = sql`coalesce((select ${products.expiryWarningDays} from ${products} where ${products.id} = ${stockBatches.productId}), ${settings.stock.expiryWarningDays})`;
  const [expired, soon] = await Promise.all([
    db
      .update(stockBatches)
      .set({ expiredAlertedAt: sql`now()`, soonAlertedAt: sql`coalesce(${stockBatches.soonAlertedAt}, now())` })
      .where(and(gt(stockBatches.qtyRemaining, 0), isNull(stockBatches.expiredAlertedAt), sql`${stockBatches.expiry} < ${today}::date`))
      .returning({ id: stockBatches.id }),
    db
      .update(stockBatches)
      .set({ soonAlertedAt: sql`now()` })
      .where(and(gt(stockBatches.qtyRemaining, 0), isNull(stockBatches.soonAlertedAt), sql`${stockBatches.expiry} >= ${today}::date and ${stockBatches.expiry} <= ${today}::date + ${window}`))
      .returning({ id: stockBatches.id }),
  ]);
  const ids = [...expired, ...soon].map((b) => b.id);
  if (!ids.length) return { batches: 0, emails: 0 };
  // Only active products are worth an email; the stamps still apply so archived items stay quiet.
  const active = await db.select({ id: stockBatches.id }).from(stockBatches).innerJoin(products, sql`${products.id} = ${stockBatches.productId} and ${products.status} = 'active'`).where(inArray(stockBatches.id, ids));
  if (!active.length) return { batches: ids.length, emails: 0 };
  const batchIds = active.map((b) => b.id).slice(0, MAX_PER_DIGEST);
  const expiredCount = expired.filter((b) => batchIds.includes(b.id)).length;
  const soonCount = batchIds.length - expiredCount;
  const parts = [expiredCount ? `${expiredCount} expired` : "", soonCount ? `${soonCount} expiring soon` : ""].filter(Boolean).join(", ");
  let emails = 0;
  for (const r of await storeAlertRecipients(settings)) {
    await enqueueEmail({ toEmail: r.email, toName: r.name, subject: `Expiry alert: ${parts}`, template: "expiry_alert", payload: { batchIds } });
    emails++;
  }
  return { batches: ids.length, emails };
}
