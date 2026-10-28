/* Expiry / FEFO invariants for src/lib/stock/expiry.ts. Run: npx tsx scripts/check-expiry.ts */
import assert from "node:assert/strict";
import { addDays, daysUntil, expiryHint, expiryStatus, isExpired, planFefo, sortFefo } from "../src/lib/stock/expiry";

const today = "2026-10-28";

// 1. Calendar arithmetic across month and year ends.
assert.equal(addDays("2026-12-30", 3), "2027-01-02");
assert.equal(addDays("2028-02-28", 1), "2028-02-29");
assert.equal(daysUntil("2026-11-01", today), 4);
assert.equal(daysUntil("2026-10-27", today), -1);

// 2. Status: sellable through the expiry day, expired the day after; warning window inclusive.
assert.equal(expiryStatus(null, today, 30), "none");
assert.equal(expiryStatus("not-a-date", today, 30), "none");
assert.equal(expiryStatus("2026-10-27", today, 30), "expired");
assert.equal(expiryStatus(today, today, 30), "expiring_soon");
assert.equal(expiryStatus("2026-11-27", today, 30), "expiring_soon");
assert.equal(expiryStatus("2026-11-28", today, 30), "fresh");
assert.equal(expiryStatus("2026-10-29", today, 0), "fresh");
assert.ok(isExpired("2026-10-27", today) && !isExpired(today, today) && !isExpired(null, today));
assert.equal(expiryHint(today, today), "Expires today");
assert.equal(expiryHint("2026-10-26", today), "Expired 2 days ago");

// 3. FEFO order: earliest expiry first, undated last, ties by age.
const batch = (id: string, expiry: string | null, qtyRemaining: number, createdAt = "2026-01-01") => ({ id, expiry, qtyRemaining, createdAt });
assert.deepEqual(sortFefo([batch("n", null, 1), batch("b", "2026-12-01", 1), batch("a2", "2026-11-01", 1, "2026-02-01"), batch("a1", "2026-11-01", 1)]).map((b) => b.id), ["a1", "a2", "b", "n"]);

// 4. Allocation skips expired batches when asked, spans batches, and reports the shortfall.
const stock = [batch("old", "2026-10-20", 5), batch("soon", "2026-11-02", 3), batch("later", "2027-01-01", 4), batch("undated", null, 10)];
const sale = planFefo(stock.map((b) => ({ ...b })), 9, { today, excludeExpired: true });
assert.deepEqual(sale.slices.map((s) => [s.batch.id, s.qty]), [["soon", 3], ["later", 4], ["undated", 2]]);
assert.equal(sale.remainder, 0);
const writeOff = planFefo(stock.map((b) => ({ ...b })), 6, { today, excludeExpired: false });
assert.deepEqual(writeOff.slices.map((s) => [s.batch.id, s.qty]), [["old", 5], ["soon", 1]]);
const short = planFefo([batch("x", "2026-10-01", 5), batch("y", "2026-12-01", 1.5)], 4, { today, excludeExpired: true });
assert.equal(short.remainder, 2.5);

// 5. Consecutive lines for one product consume the same batch objects in sequence.
const shared = [batch("p", "2026-11-05", 2), batch("q", "2026-11-09", 2)];
planFefo(shared, 1.5, { today, excludeExpired: true });
const second = planFefo(shared, 1.5, { today, excludeExpired: true });
assert.deepEqual(second.slices.map((s) => [s.batch.id, s.qty]), [["p", 0.5], ["q", 1]]);

console.log("expiry checks passed");
