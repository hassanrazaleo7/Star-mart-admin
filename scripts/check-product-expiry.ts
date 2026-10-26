import assert from "node:assert/strict";
import { expiryDateSchema, productInputSchema } from "../src/lib/validation/products";

for (const value of [undefined, null, "", "   "]) {
  assert.equal(expiryDateSchema.parse(value), null);
}
for (const value of ["2028-02-29", "2026-12-31", "2025-01-01"]) {
  assert.equal(expiryDateSchema.parse(value), value);
}
for (const value of ["2026-02-29", "2026-04-31", "2026-13-01", "31/12/2026", "2026-12-31T00:00:00Z", 123]) {
  assert.equal(expiryDateSchema.safeParse(value).success, false, String(value));
}
const product = {
  sku: "MILK-1L", name: "Milk", unit: "pcs", costPaisa: "200", pricePaisa: "250",
  taxRateBps: "0", reorderLevel: "5", reorderQty: "10", status: "active", initialStock: "20",
};
assert.equal(productInputSchema.parse({ ...product, expiryDate: "2026-12-31" }).expiryDate, "2026-12-31");
assert.equal(productInputSchema.parse({ ...product, expiryDate: "" }).expiryDate, null);
assert.equal(productInputSchema.parse(product).expiryDate, null);
assert.equal(productInputSchema.safeParse({ ...product, expiryDate: "2026-02-30" }).success, false);
console.log("Product expiry checks passed (blank, valid, invalid dates and product validation).");
