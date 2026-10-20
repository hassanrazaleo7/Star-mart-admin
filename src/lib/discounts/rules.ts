import type { DiscountCode } from "@/db/schema";

/** Pure discount rules shared by the server commands and the client editors. */
export type DiscountRule = Pick<DiscountCode, "code" | "kind" | "value" | "maxDiscountPaisa" | "minOrderPaisa">;

/** Discount amount for a code on a given subtotal (percent floored, capped by max; fixed capped by subtotal). */
export function discountAmount(code: Pick<DiscountCode, "kind" | "value" | "maxDiscountPaisa">, subtotalPaisa: number): number {
  if (subtotalPaisa <= 0) return 0;
  let amount = code.kind === "percent" ? Math.floor((subtotalPaisa * code.value) / 10000) : Math.min(code.value, subtotalPaisa);
  if (code.maxDiscountPaisa != null) amount = Math.min(amount, code.maxDiscountPaisa);
  return Math.max(0, Math.min(amount, subtotalPaisa));
}

export type DiscountCheck =
  | { ok: true; code: DiscountCode; discountPaisa: number }
  | { ok: false; reason: "not_found" | "inactive" | "not_started" | "expired" | "exhausted" | "min_order"; message: string; code?: DiscountCode };

export function evaluateDiscount(code: DiscountCode | undefined, subtotalPaisa: number, now = new Date()): DiscountCheck {
  if (!code) return { ok: false, reason: "not_found", message: "Unknown discount code." };
  if (!code.isActive) return { ok: false, reason: "inactive", message: "This code is no longer active.", code };
  if (code.startsAt && code.startsAt > now) return { ok: false, reason: "not_started", message: "This code is not valid yet.", code };
  if (code.endsAt && code.endsAt <= now) return { ok: false, reason: "expired", message: "This code has expired.", code };
  if (code.usageLimit != null && code.usedCount >= code.usageLimit) return { ok: false, reason: "exhausted", message: "This code has been used up.", code };
  if (subtotalPaisa < code.minOrderPaisa) return { ok: false, reason: "min_order", message: `Minimum order for this code is ${(code.minOrderPaisa / 100).toFixed(2)}.`, code };
  return { ok: true, code, discountPaisa: discountAmount(code, subtotalPaisa) };
}
