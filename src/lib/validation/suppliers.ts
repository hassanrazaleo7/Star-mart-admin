import { z } from "zod";
import { STOCK_ADJUSTMENT_REASONS, SUPPLIER_PAYMENT_METHODS, UNITS } from "@/db/schema";
import { emailSchema } from "@/lib/auth/validation";
import { moneyInputSchema, paisaSchema, positiveMoneySchema } from "@/lib/money";
import { checkboxSchema, isoDateSchema, optionalTextSchema, optionalUuidSchema, positiveQuantitySchema, quantitySchema, uuidSchema } from "./common";

export const supplierInputSchema = z.object({
  id: optionalUuidSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
  contactName: optionalTextSchema(120),
  phone: optionalTextSchema(40),
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), emailSchema.optional()).transform((v) => v ?? null),
  address: optionalTextSchema(500),
  taxId: optionalTextSchema(60),
  paymentTerms: optionalTextSchema(200),
  notes: optionalTextSchema(2000),
});

export const purchaseLineSchema = z.object({
  productId: uuidSchema,
  qty: positiveQuantitySchema,
  unitCostPaisa: paisaSchema,
  batch: z.string().trim().max(60).optional().transform((v) => (v ? v : null)),
  expiry: z.preprocess((v) => (v === "" || v == null ? undefined : v), isoDateSchema.optional()).transform((v) => v ?? null),
});
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;

const linesFromJson = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}, z.array(purchaseLineSchema).min(1, "Add at least one line").max(200));

export const purchaseInputSchema = z.object({
  supplierId: uuidSchema,
  invoiceRef: optionalTextSchema(80),
  notes: optionalTextSchema(2000),
  receiveNow: checkboxSchema,
  lines: linesFromJson,
});

export const supplierPaymentSchema = z.object({
  supplierId: uuidSchema,
  purchaseId: optionalUuidSchema,
  amountPaisa: positiveMoneySchema,
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  reference: optionalTextSchema(100),
  note: optionalTextSchema(500),
  paidAt: z.preprocess((v) => (v === "" || v == null ? undefined : v), isoDateSchema.optional()),
});

export const purchaseReturnSchema = z.object({
  supplierId: uuidSchema,
  purchaseId: optionalUuidSchema,
  productId: uuidSchema,
  qty: positiveQuantitySchema,
  amountPaisa: moneyInputSchema.refine((p) => p >= 0, "Amount cannot be negative"),
  reason: optionalTextSchema(300),
});

export const stockAdjustmentSchema = z.object({
  productId: uuidSchema,
  direction: z.enum(["in", "out"]),
  qty: positiveQuantitySchema,
  reason: z.enum(STOCK_ADJUSTMENT_REASONS),
  note: optionalTextSchema(500),
});

export const stockTakeSchema = z.object({
  entries: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return undefined;
      }
    },
    z.array(z.object({ productId: uuidSchema, countedQty: quantitySchema })).min(1).max(1000),
  ),
  note: optionalTextSchema(500),
});

// Vendor portal submissions
export const submitProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  sku: optionalTextSchema(64),
  barcode: optionalTextSchema(64),
  description: optionalTextSchema(2000),
  unit: z.enum(UNITS),
  allowFractional: checkboxSchema,
  costPaisa: moneyInputSchema.refine((p) => p >= 0, "Cost cannot be negative"),
  suggestedPricePaisa: moneyInputSchema.refine((p) => p >= 0, "Price cannot be negative"),
  taxRateBps: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "0" : v), z.coerce.number().min(0).max(100).transform((p) => Math.round(p * 100))),
  categoryName: optionalTextSchema(80),
  imageUrl: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  imagePathname: optionalTextSchema(500),
  note: optionalTextSchema(1000),
});

export const submitSupplySchema = z.object({
  invoiceRef: optionalTextSchema(80),
  note: optionalTextSchema(1000),
  lines: linesFromJson,
});

export const reviewSubmissionSchema = z.object({
  submissionId: uuidSchema,
  note: optionalTextSchema(500),
});
