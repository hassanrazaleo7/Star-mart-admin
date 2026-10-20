import { z } from "zod";
import { ORDER_FULFILLMENTS, ORDER_STATUSES, PAYMENT_METHODS } from "@/db/schema";
import { emailSchema } from "@/lib/auth/validation";
import { moneyInputSchema, paisaSchema, positiveMoneySchema } from "@/lib/money";
import { blankToUndefined, optionalTextSchema, optionalUuidSchema, positiveQuantitySchema, uuidSchema } from "@/lib/validation/common";
import { phoneSchema } from "@/lib/validation/customers";

const fromJson = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }, schema);

export const orderLineSchema = z.object({
  productId: uuidSchema,
  qty: positiveQuantitySchema,
  unitPricePaisa: paisaSchema.optional().nullable(),
  lineDiscountPaisa: paisaSchema.optional().default(0),
});
export type OrderLineInput = z.infer<typeof orderLineSchema>;

export const paymentInputSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountPaisa: paisaSchema.refine((p) => p > 0, "Payment amount must be positive"),
  reference: optionalTextSchema(100),
  note: optionalTextSchema(300),
});

const optionalDateTime = z.preprocess(blankToUndefined, z.coerce.date().optional()).transform((v) => v ?? null);
const pointsSchema = z.preprocess((v) => (v === "" || v == null ? "0" : v), z.coerce.number().int().min(0).max(10_000_000));
const codeSchema = z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v == null ? undefined : v), z.string().max(32).optional()).transform((v) => (v ? v : null));

export const createOrderSchema = z
  .object({
    channel: z.enum(["phone", "walk_in"]),
    fulfillment: z.enum(ORDER_FULFILLMENTS),
    customerId: optionalUuidSchema,
    customerName: optionalTextSchema(120),
    customerPhone: optionalTextSchema(40),
    deliveryAddress: optionalTextSchema(500),
    scheduledFor: optionalDateTime,
    notes: optionalTextSchema(1000),
    discountCode: codeSchema,
    pointsToRedeem: pointsSchema,
    lines: fromJson(z.array(orderLineSchema).min(1, "Add at least one product").max(200)),
    depositMethod: z.preprocess(blankToUndefined, z.enum(PAYMENT_METHODS).optional()),
    depositAmount: z.preprocess(blankToUndefined, positiveMoneySchema.optional()),
    depositReference: optionalTextSchema(100),
  })
  .superRefine((d, ctx) => {
    if (d.fulfillment === "delivery" && !d.deliveryAddress) ctx.addIssue({ code: "custom", path: ["deliveryAddress"], message: "Delivery address is required" });
    if (d.depositAmount && !d.depositMethod) ctx.addIssue({ code: "custom", path: ["depositMethod"], message: "Choose how the deposit was paid" });
    if (d.depositMethod === "credit" && !d.customerId) ctx.addIssue({ code: "custom", path: ["depositMethod"], message: "Credit requires a customer account" });
  });
export type CreateOrderForm = z.infer<typeof createOrderSchema>;

/** Guest checkout: details stored on the sale only (receipt + optional receipt email); no customer record. */
export const posGuestSchema = z.object({
  name: optionalTextSchema(120),
  phone: z.preprocess(blankToUndefined, phoneSchema.optional()).transform((v) => v ?? null),
  email: z.preprocess(blankToUndefined, emailSchema.optional()).transform((v) => v ?? null),
});

export const posSaleSchema = z
  .object({
    customerId: optionalUuidSchema,
    guest: posGuestSchema.optional(),
    discountCode: codeSchema,
    pointsToRedeem: pointsSchema,
    notes: optionalTextSchema(500),
    lines: z.array(orderLineSchema).min(1, "Add at least one product").max(200),
    payments: z.array(paymentInputSchema).min(1, "Add a payment").max(10),
  })
  .superRefine((d, ctx) => {
    if (d.guest && d.customerId) ctx.addIssue({ code: "custom", path: ["guest"], message: "Choose either a customer account or guest details." });
    if (d.guest && d.pointsToRedeem > 0) ctx.addIssue({ code: "custom", path: ["pointsToRedeem"], message: "Select a customer to redeem points." });
    if (d.guest && d.payments.some((p) => p.method === "credit")) ctx.addIssue({ code: "custom", path: ["payments"], message: "Credit sales need a customer account." });
  });
export type PosSaleInput = z.infer<typeof posSaleSchema>;

export const recordPaymentSchema = z.object({
  orderId: uuidSchema,
  method: z.enum(PAYMENT_METHODS),
  amount: positiveMoneySchema,
  received: z.preprocess(blankToUndefined, moneyInputSchema.optional()),
  reference: optionalTextSchema(100),
  note: optionalTextSchema(300),
});

export const transitionOrderSchema = z.object({
  orderId: uuidSchema,
  to: z.enum(ORDER_STATUSES),
  note: optionalTextSchema(300),
});

export const cancelOrderSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().trim().min(3, "Give a short reason").max(300),
  refundMethod: z.preprocess(blankToUndefined, z.enum(PAYMENT_METHODS).optional()),
});

export const orderListParamsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum([...ORDER_STATUSES, "open", "all"]).default("all"),
  fulfillment: z.enum([...ORDER_FULFILLMENTS, ""]).optional(),
  payment: z.enum(["unpaid", "partial", "paid", "refunded", ""]).optional(),
  channel: z.enum(["pos", "phone", "walk_in", ""]).optional(),
  customer: optionalUuidSchema,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type OrderListParams = z.infer<typeof orderListParamsSchema>;
