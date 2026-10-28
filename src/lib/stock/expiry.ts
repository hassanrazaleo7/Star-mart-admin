// Pure expiry helpers shared by server code, client components and the public API.
// Dates are store-local calendar days (YYYY-MM-DD). A batch is sellable through
// its expiry day and expired from the next day on.

export type ExpiryStatus = "expired" | "expiring_soon" | "fresh" | "none";

export const EXPIRY_STATUS_LABEL: Record<ExpiryStatus, string> = {
  expired: "Expired",
  expiring_soon: "Expiring soon",
  fresh: "Fresh",
  none: "No expiry",
};

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `today` to `expiry` (0 = expires today, negative = already expired). */
export function daysUntil(expiry: string, today: string): number {
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

export function expiryStatus(expiry: string | null | undefined, today: string, warningDays: number): ExpiryStatus {
  if (!expiry || !ISO.test(expiry)) return "none";
  const days = daysUntil(expiry, today);
  if (days < 0) return "expired";
  if (days <= warningDays) return "expiring_soon";
  return "fresh";
}

export function isExpired(expiry: string | null | undefined, today: string): boolean {
  return !!expiry && expiry < today;
}

/** Effective warning window: the product override, else the store setting. */
export function warningDaysFor(product: { expiryWarningDays: number | null }, storeDefault: number): number {
  return product.expiryWarningDays ?? storeDefault;
}

/** Human summary such as "Expires today", "3 days left", "Expired 2 days ago". */
export function expiryHint(expiry: string | null | undefined, today: string): string {
  if (!expiry) return "No expiry";
  const days = daysUntil(expiry, today);
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days > 1) return `${days} days left`;
  if (days === -1) return "Expired yesterday";
  return `Expired ${-days} days ago`;
}

export function expiryBadgeVariant(status: ExpiryStatus): "destructive" | "secondary" | "outline" {
  return status === "expired" ? "destructive" : status === "expiring_soon" ? "secondary" : "outline";
}

export type FefoBatch = { id: string; expiry: string | null; qtyRemaining: number; createdAt?: Date | string };

/** Earliest expiry first; undated batches last; ties by age. */
export function sortFefo<T extends FefoBatch>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    if (a.expiry !== b.expiry) {
      if (a.expiry == null) return 1;
      if (b.expiry == null) return -1;
      return a.expiry < b.expiry ? -1 : 1;
    }
    return String(a.createdAt ?? "") < String(b.createdAt ?? "") ? -1 : 1;
  });
}

/**
 * Takes `qty` from the batches, earliest expiry first. Mutates `qtyRemaining` on
 * the given objects so several lines for the same product consume in sequence.
 */
export function planFefo<T extends FefoBatch>(batches: T[], qty: number, options: { today: string; excludeExpired: boolean }): { slices: { batch: T; qty: number }[]; remainder: number } {
  const slices: { batch: T; qty: number }[] = [];
  let left = Math.round(qty * 1000) / 1000;
  for (const batch of sortFefo(batches)) {
    if (left <= 0) break;
    if (batch.qtyRemaining <= 0) continue;
    if (options.excludeExpired && isExpired(batch.expiry, options.today)) continue;
    const take = Math.min(batch.qtyRemaining, left);
    batch.qtyRemaining = Math.round((batch.qtyRemaining - take) * 1000) / 1000;
    left = Math.round((left - take) * 1000) / 1000;
    slices.push({ batch, qty: take });
  }
  return { slices, remainder: left };
}
