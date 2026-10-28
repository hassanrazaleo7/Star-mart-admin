import "server-only";
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, products, suppliers } from "@/db/schema";
import { getSettings, type Settings } from "@/lib/settings";
import { enqueueEmail } from "./outbox";

const COOLDOWN_HOURS = 24;

/** Who receives store alerts: the store email, or every active super admin when it is unset. */
export async function storeAlertRecipients(settings: Settings): Promise<{ email: string; name: string }[]> {
  if (settings.store.email) return [{ email: settings.store.email, name: settings.store.name }];
  const admins = await db.select({ email: adminUsers.email, name: adminUsers.name }).from(adminUsers).where(and(eq(adminUsers.isActive, true), eq(adminUsers.role, "super_admin")));
  return admins.map((u) => ({ email: u.email, name: u.name }));
}
const MAX_PER_DIGEST = 100;

/**
 * Finds products at or below their reorder level that were not reported in the
 * last 24 hours, stamps them atomically, and queues one digest for the store
 * plus one per supplier. Returns the number of products reported.
 */
export async function checkLowStock(): Promise<{ products: number; emails: number }> {
  const settings = await getSettings();
  if (!settings.stock.lowStockEmails) return { products: 0, emails: 0 };
  const due = await db
    .update(products)
    .set({ lowStockNotifiedAt: sql`now()` })
    .where(and(eq(products.status, "active"), gt(products.reorderLevel, 0), lte(products.stockQty, products.reorderLevel), or(isNull(products.lowStockNotifiedAt), lte(products.lowStockNotifiedAt, sql`now() - make_interval(hours => ${COOLDOWN_HOURS})`))))
    .returning({ id: products.id, supplierId: products.supplierId });
  if (!due.length) return { products: 0, emails: 0 };
  let emails = 0;
  const ids = due.map((p) => p.id).slice(0, MAX_PER_DIGEST);

  const storeRecipients = await storeAlertRecipients(settings);
  for (const r of storeRecipients) {
    await enqueueEmail({ toEmail: r.email, toName: r.name, subject: `Low stock: ${due.length} product${due.length === 1 ? "" : "s"} need reordering`, template: "low_stock", payload: { productIds: ids } });
    emails++;
  }

  const bySupplier = new Map<string, string[]>();
  for (const p of due) if (p.supplierId) bySupplier.set(p.supplierId, [...(bySupplier.get(p.supplierId) ?? []), p.id]);
  if (bySupplier.size) {
    const rows = await db.select({ id: suppliers.id, name: suppliers.name, email: suppliers.email }).from(suppliers).where(and(inArray(suppliers.id, [...bySupplier.keys()]), eq(suppliers.isActive, true)));
    for (const s of rows) {
      if (!s.email) continue;
      await enqueueEmail({ toEmail: s.email, toName: s.name, subject: `Restock request from ${settings.store.name}`, template: "supplier_low_stock", payload: { supplierId: s.id, productIds: bySupplier.get(s.id)!.slice(0, MAX_PER_DIGEST) } });
      emails++;
    }
  }
  return { products: due.length, emails };
}
