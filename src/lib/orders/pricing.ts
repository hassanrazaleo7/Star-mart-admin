import { discountAmount, type DiscountRule } from "@/lib/discounts/rules";
import { pointsEarnedFor, pointsValue } from "@/lib/loyalty/points";
import { lineTotal, taxPortion } from "@/lib/money";
import type { Settings } from "@/lib/settings";
import type { CartLine } from "./types";

// Pure pricing shared by the order editor, the POS and the server commands.
// All amounts are integer paisa; prices are tax-inclusive.

export type PricingSettings = Pick<Settings, "loyalty" | "delivery">;

export type PriceInput = {
  lines: CartLine[];
  discount: DiscountRule | null;
  pointsToRedeem: number;
  customer: { pointsBalance: number } | null;
  fulfillment: "pickup" | "delivery";
  /** Explicit delivery fee override; otherwise computed from settings. */
  deliveryFeePaisa?: number | null;
  settings: PricingSettings;
};

export type PricedLine = CartLine & {
  grossPaisa: number;
  codeDiscountPaisa: number;
  discountPaisa: number;
  netPaisa: number;
  taxPaisa: number;
};

export type PricedCart = {
  lines: PricedLine[];
  subtotalPaisa: number;
  manualDiscountPaisa: number;
  codeDiscountPaisa: number;
  discountPaisa: number;
  taxPaisa: number;
  deliveryFeePaisa: number;
  pointsRedeemed: number;
  pointsValuePaisa: number;
  totalPaisa: number;
  pointsEarned: number;
  /** Human-readable problems; the server refuses to create an order while any exist. */
  issues: string[];
};

/** Splits `amount` across `weights` proportionally, assigning rounding remainders to the largest fractions. */
export function allocateByWeight(amount: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w) * amount) / total);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = amount - floors.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => ({ i, frac: r - floors[i]! })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    if (floors[i]! + 1 <= Math.max(0, weights[i]!)) {
      floors[i]! += 1;
      remainder -= 1;
    }
  }
  return floors;
}

export function priceCart(input: PriceInput): PricedCart {
  const issues: string[] = [];
  const { loyalty, delivery } = input.settings;

  const base = input.lines.map((l) => {
    const qty = Math.round(l.qty * 1000) / 1000;
    if (qty <= 0) issues.push(`${l.name}: quantity must be greater than zero.`);
    if (!l.allowFractional && !Number.isInteger(qty)) issues.push(`${l.name} is sold in whole units.`);
    const grossPaisa = lineTotal(l.unitPricePaisa, qty);
    const manual = Math.max(0, Math.min(Math.round(l.lineDiscountPaisa || 0), grossPaisa));
    return { ...l, qty, grossPaisa, manual };
  });

  const subtotalPaisa = base.reduce((s, l) => s + l.grossPaisa, 0);
  const manualDiscountPaisa = base.reduce((s, l) => s + l.manual, 0);
  const afterManual = subtotalPaisa - manualDiscountPaisa;
  const codeDiscountPaisa = input.discount ? Math.min(discountAmount(input.discount, afterManual), afterManual) : 0;
  if (input.discount && afterManual < input.discount.minOrderPaisa) issues.push(`Minimum order for ${input.discount.code} is ${(input.discount.minOrderPaisa / 100).toFixed(2)}.`);
  const codeShares = allocateByWeight(codeDiscountPaisa, base.map((l) => l.grossPaisa - l.manual));

  const lines: PricedLine[] = base.map((l, i) => {
    const codeDiscount = codeShares[i] ?? 0;
    const discountPaisa = l.manual + codeDiscount;
    const netPaisa = l.grossPaisa - discountPaisa;
    const { manual, ...rest } = l;
    return { ...rest, lineDiscountPaisa: manual, codeDiscountPaisa: codeDiscount, discountPaisa, netPaisa, taxPaisa: taxPortion(netPaisa, l.taxRateBps) };
  });

  const discountPaisa = manualDiscountPaisa + codeDiscountPaisa;
  const taxPaisa = lines.reduce((s, l) => s + l.taxPaisa, 0);
  const afterDiscount = subtotalPaisa - discountPaisa;

  let pointsRedeemed = Math.max(0, Math.floor(input.pointsToRedeem || 0));
  let pointsValuePaisa = 0;
  if (pointsRedeemed > 0) {
    if (!loyalty.enabled) issues.push("Loyalty points are disabled.");
    else if (!input.customer) issues.push("Select a customer to redeem points.");
    else if (pointsRedeemed > input.customer.pointsBalance) issues.push(`The customer has only ${input.customer.pointsBalance} points.`);
    else if (pointsRedeemed < loyalty.minRedeemPoints) issues.push(`At least ${loyalty.minRedeemPoints} points must be redeemed at once.`);
    pointsValuePaisa = pointsValue(pointsRedeemed, loyalty);
    if (pointsValuePaisa > afterDiscount) issues.push("Redeemed points exceed the order value.");
  } else {
    pointsRedeemed = 0;
  }

  let deliveryFeePaisa = 0;
  if (input.fulfillment === "delivery") {
    if (input.deliveryFeePaisa != null) deliveryFeePaisa = Math.max(0, Math.round(input.deliveryFeePaisa));
    else deliveryFeePaisa = delivery.freeAbovePaisa != null && afterDiscount >= delivery.freeAbovePaisa ? 0 : delivery.feePaisa;
  }

  const totalPaisa = Math.max(0, afterDiscount - pointsValuePaisa + deliveryFeePaisa);
  const pointsEarned = input.customer ? pointsEarnedFor(afterDiscount - pointsValuePaisa, loyalty) : 0;
  if (lines.length === 0) issues.push("Add at least one product.");

  return { lines, subtotalPaisa, manualDiscountPaisa, codeDiscountPaisa, discountPaisa, taxPaisa, deliveryFeePaisa, pointsRedeemed, pointsValuePaisa, totalPaisa, pointsEarned, issues };
}

/** Settles tendered payments against a total: applied amounts, cash change and the remaining balance. */
export function settlePayments<P extends { method: string; amountPaisa: number }>(totalPaisa: number, payments: P[]) {
  let remaining = totalPaisa;
  const applied = payments.map((p) => {
    const tendered = Math.max(0, Math.round(p.amountPaisa));
    const amount = Math.min(tendered, remaining);
    remaining -= amount;
    const change = p.method === "cash" ? tendered - amount : 0;
    return { ...p, tenderedPaisa: tendered, appliedPaisa: amount, changePaisa: change, overpaid: p.method !== "cash" && tendered > amount };
  });
  return { applied, paidPaisa: totalPaisa - remaining, remainingPaisa: remaining, changePaisa: applied.reduce((s, p) => s + p.changePaisa, 0) };
}

export function paymentStatusFor(paidPaisa: number, totalPaisa: number): "unpaid" | "partial" | "paid" {
  if (totalPaisa <= 0 || paidPaisa >= totalPaisa) return "paid";
  return paidPaisa > 0 ? "partial" : "unpaid";
}
