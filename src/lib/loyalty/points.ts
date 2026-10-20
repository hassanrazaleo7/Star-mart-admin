import type { Settings } from "@/lib/settings";

export type LoyaltySettings = Settings["loyalty"];

/** Points earned on an amount actually paid by the customer (after discounts, excluding redeemed value). */
export function pointsEarnedFor(paidPaisa: number, loyalty: LoyaltySettings): number {
  if (!loyalty.enabled || paidPaisa <= 0 || loyalty.earnPerPaisa <= 0) return 0;
  return Math.floor(paidPaisa / loyalty.earnPerPaisa);
}

/** Value in paisa of a number of redeemed points. */
export function pointsValue(points: number, loyalty: LoyaltySettings): number {
  return Math.max(0, Math.floor(points)) * loyalty.redeemValuePaisa;
}

/** Largest number of points worth at most `maxPaisa`, respecting the balance and minimum. */
export function maxRedeemablePoints(balance: number, maxPaisa: number, loyalty: LoyaltySettings): number {
  if (!loyalty.enabled || balance < loyalty.minRedeemPoints || loyalty.redeemValuePaisa <= 0) return 0;
  return Math.max(0, Math.min(balance, Math.floor(maxPaisa / loyalty.redeemValuePaisa)));
}
