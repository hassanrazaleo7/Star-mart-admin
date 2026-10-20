/* Pricing invariants for src/lib/orders/pricing.ts. Run: npx tsx scripts/check-pricing.ts */
import assert from "node:assert/strict";
import { allocateByWeight, paymentStatusFor, priceCart, settlePayments } from "../src/lib/orders/pricing";
import type { CartLine } from "../src/lib/orders/types";

const settings = {
  loyalty: { enabled: true, earnPerPaisa: 10_000, redeemValuePaisa: 100, minRedeemPoints: 100 },
  delivery: { feePaisa: 15_000, freeAbovePaisa: 500_000 },
};
const line = (over: Partial<CartLine>): CartLine => ({
  productId: crypto.randomUUID(), name: "Item", sku: "SKU", unit: "pcs", allowFractional: false, qty: 1, unitPricePaisa: 10_000, listPricePaisa: 10_000, costPaisa: 6_000, taxRateBps: 0, lineDiscountPaisa: 0, stockQty: 10, ...over,
});

// 1. Allocation sums exactly and respects weights.
assert.deepEqual(allocateByWeight(100, [1000, 1000, 1000]), [34, 33, 33]);
assert.deepEqual(allocateByWeight(10, [0, 50]), [0, 10]);
assert.equal(allocateByWeight(999, [3000, 7000, 11000]).reduce((a, b) => a + b, 0), 999);

// 2. Percent discount floors, tax is derived from discounted net, totals reconcile.
const c1 = priceCart({ lines: [line({ qty: 3, unitPricePaisa: 33_333, taxRateBps: 1700 }), line({ qty: 1, unitPricePaisa: 10_001, taxRateBps: 500 })], discount: { code: "TEN", kind: "percent", value: 1000, maxDiscountPaisa: null, minOrderPaisa: 0 }, pointsToRedeem: 0, customer: null, fulfillment: "pickup", settings });
assert.equal(c1.subtotalPaisa, 99_999 + 10_001);
assert.equal(c1.codeDiscountPaisa, Math.floor(110_000 * 0.1));
assert.equal(c1.lines.reduce((s, l) => s + l.codeDiscountPaisa, 0), c1.codeDiscountPaisa);
assert.equal(c1.lines.reduce((s, l) => s + l.netPaisa, 0), c1.subtotalPaisa - c1.discountPaisa);
assert.equal(c1.totalPaisa, c1.subtotalPaisa - c1.discountPaisa);
assert.ok(c1.taxPaisa > 0 && c1.taxPaisa < c1.totalPaisa);
assert.equal(c1.issues.length, 0);

// 3. Fixed discount capped by subtotal and max; delivery fee waived above threshold.
const c2 = priceCart({ lines: [line({ qty: 2, unitPricePaisa: 300_000 })], discount: { code: "BIG", kind: "fixed", value: 900_000, maxDiscountPaisa: 50_000, minOrderPaisa: 0 }, pointsToRedeem: 0, customer: null, fulfillment: "delivery", settings });
assert.equal(c2.codeDiscountPaisa, 50_000);
assert.equal(c2.deliveryFeePaisa, 0);
const c3 = priceCart({ lines: [line({ qty: 1, unitPricePaisa: 100_000 })], discount: null, pointsToRedeem: 0, customer: null, fulfillment: "delivery", settings });
assert.equal(c3.deliveryFeePaisa, 15_000);
assert.equal(c3.totalPaisa, 115_000);

// 4. Points: minimum, balance, value cap; earning excludes redeemed value and is floored.
const c4 = priceCart({ lines: [line({ qty: 1, unitPricePaisa: 250_000 })], discount: null, pointsToRedeem: 150, customer: { pointsBalance: 400 }, fulfillment: "pickup", settings });
assert.equal(c4.pointsValuePaisa, 15_000);
assert.equal(c4.totalPaisa, 235_000);
assert.equal(c4.pointsEarned, Math.floor(235_000 / 10_000));
assert.equal(c4.issues.length, 0);
assert.ok(priceCart({ ...c4Input(50) }).issues.some((i) => /At least 100/.test(i)));
assert.ok(priceCart({ ...c4Input(500) }).issues.some((i) => /only 400/.test(i)));
assert.ok(priceCart({ lines: [line({ qty: 1, unitPricePaisa: 10_000 })], discount: null, pointsToRedeem: 200, customer: { pointsBalance: 1000 }, fulfillment: "pickup", settings }).issues.some((i) => /exceed/.test(i)));
function c4Input(points: number) {
  return { lines: [line({ qty: 1, unitPricePaisa: 250_000 })], discount: null, pointsToRedeem: points, customer: { pointsBalance: 400 }, fulfillment: "pickup" as const, settings };
}

// 5. Fractional quantities round to 3 decimals and are refused for whole-unit products.
const c5 = priceCart({ lines: [line({ qty: 1.2345, unitPricePaisa: 45_000, allowFractional: true, unit: "kg" })], discount: null, pointsToRedeem: 0, customer: null, fulfillment: "pickup", settings });
assert.equal(c5.lines[0]!.qty, 1.235);
assert.equal(c5.lines[0]!.grossPaisa, Math.round(45_000 * 1.235));
assert.ok(priceCart({ lines: [line({ qty: 1.5 })], discount: null, pointsToRedeem: 0, customer: null, fulfillment: "pickup", settings }).issues.some((i) => /whole units/.test(i)));

// 6. Manual line discounts come before the code discount and never exceed the line.
const c6 = priceCart({ lines: [line({ qty: 1, unitPricePaisa: 10_000, lineDiscountPaisa: 50_000 })], discount: { code: "HALF", kind: "percent", value: 5000, maxDiscountPaisa: null, minOrderPaisa: 0 }, pointsToRedeem: 0, customer: null, fulfillment: "pickup", settings });
assert.equal(c6.manualDiscountPaisa, 10_000);
assert.equal(c6.codeDiscountPaisa, 0);
assert.equal(c6.totalPaisa, 0);

// 7. Payment settlement: cash change, non-cash overpayment flagged, status.
const s1 = settlePayments(73_500, [{ method: "cash", amountPaisa: 100_000 }]);
assert.equal(s1.changePaisa, 26_500);
assert.equal(s1.paidPaisa, 73_500);
const s2 = settlePayments(73_500, [{ method: "card", amountPaisa: 50_000 }, { method: "cash", amountPaisa: 20_000 }]);
assert.equal(s2.remainingPaisa, 3_500);
assert.equal(paymentStatusFor(s2.paidPaisa, 73_500), "partial");
const s3 = settlePayments(10_000, [{ method: "card", amountPaisa: 12_000 }]);
assert.ok(s3.applied[0]!.overpaid);
assert.equal(paymentStatusFor(0, 0), "paid");

console.log("pricing checks passed");
