import { z } from "zod";
import { CUSTOMER_TYPES, DISCOUNT_KINDS, PAYMENT_METHODS } from "@/db/schema";
import { emailSchema } from "@/lib/auth/validation";
import { moneyInputSchema, positiveMoneySchema } from "@/lib/money";
import { blankToUndefined, optionalTextSchema, optionalUuidSchema, uuidSchema } from "./common";

export const phoneSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[^\d+]/g, "").replace(/^\+/, "") : v),
  z.string().regex(/^\d{7,15}$/, "Phone must be 7 to 15 digits"),
);

export const customerSchema = z.object({
  id: optionalUuidSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.preprocess(blankToUndefined, phoneSchema.optional()).transform((v) => v ?? null),
  email: z.preprocess(blankToUndefined, emailSchema.optional()).transform((v) => v ?? null),
  address: optionalTextSchema(500),
  type: z.enum(CUSTOMER_TYPES).default("retail"),
  creditLimitPaisa: z.preprocess((v) => blankToUndefined(v) ?? "0", moneyInputSchema.refine((p) => p >= 0, "Credit limit cannot be negative")),
  notes: optionalTextSchema(1000),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const adjustPointsSchema = z.object({
  customerId: uuidSchema,
  pointsDelta: z.coerce.number().int().refine((n) => n !== 0, "Enter a non-zero number of points").refine((n) => Math.abs(n) <= 1_000_000, "Too many points"),
  note: z.string().trim().min(3, "Add a short note (at least 3 characters)").max(200),
});

export const creditPaymentSchema = z.object({
  customerId: uuidSchema,
  amountPaisa: positiveMoneySchema,
  method: z.enum(PAYMENT_METHODS.filter((m) => m !== "credit") as ["cash", "card", "bank_transfer"]),
  reference: optionalTextSchema(100),
  note: optionalTextSchema(500),
});

const optionalDateTime = z.preprocess(blankToUndefined, z.coerce.date().optional()).transform((v) => v ?? null);

export const discountSchema = z
  .object({
    id: optionalUuidSchema,
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "Code: 3–32 letters, digits, dashes or underscores"),
    kind: z.enum(DISCOUNT_KINDS),
    value: z.string().trim().min(1, "Value is required"),
    minOrderPaisa: z.preprocess((v) => blankToUndefined(v) ?? "0", moneyInputSchema.refine((p) => p >= 0)),
    maxDiscountPaisa: z.preprocess(blankToUndefined, moneyInputSchema.refine((p) => p > 0, "Max discount must be positive").optional()).transform((v) => v ?? null),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    usageLimit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()).transform((v) => v ?? null),
  })
  .transform((d, ctx) => {
    let value: number;
    if (d.kind === "percent") {
      const pct = Number(d.value);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percent must be between 0.01 and 100" });
        return z.NEVER;
      }
      value = Math.round(pct * 100);
    } else {
      try {
        value = moneyInputSchema.parse(d.value);
      } catch {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Enter an amount like 250.00" });
        return z.NEVER;
      }
      if (value <= 0) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Amount must be positive" });
        return z.NEVER;
      }
    }
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
      return z.NEVER;
    }
    return { ...d, value };
  });
export type DiscountInput = z.infer<typeof discountSchema>;
