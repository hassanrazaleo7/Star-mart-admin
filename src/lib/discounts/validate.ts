import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discountCodes } from "@/db/schema";
import { evaluateDiscount, type DiscountCheck } from "./rules";

export { discountAmount, evaluateDiscount, type DiscountCheck, type DiscountRule } from "./rules";

export async function validateDiscountCode(rawCode: string, subtotalPaisa: number, now = new Date()): Promise<DiscountCheck> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "not_found", message: "Enter a discount code." };
  const row = await db.query.discountCodes.findFirst({ where: eq(discountCodes.code, code) });
  return evaluateDiscount(row, subtotalPaisa, now);
}
