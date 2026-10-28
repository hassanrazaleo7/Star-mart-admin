import { z } from "zod";
import { PRODUCT_STATUSES, UNITS } from "@/db/schema";
import { moneyInputSchema } from "@/lib/money";
import { checkboxSchema, isoDateSchema, optionalTextSchema, optionalUuidSchema, quantitySchema, uuidSchema } from "./common";

const shelfLifeSchema = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1).max(3650).optional()).transform((v) => v ?? null);
const warningDaysSchema = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(365).optional()).transform((v) => v ?? null);
const optionalDateSchema = z.preprocess((v) => (v === "" || v == null ? undefined : v), isoDateSchema.optional()).transform((v) => v ?? null);

export const unitSchema = z.enum(UNITS);
export const productStatusSchema = z.enum(PRODUCT_STATUSES);

export const skuSchema = z
  .string()
  .trim()
  .min(1, "SKU is required")
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "SKU may contain letters, digits, dots, dashes and underscores")
  .transform((s) => s.toUpperCase());

export const barcodeSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\s+/g, "") : v),
  z.string().max(64).regex(/^[A-Za-z0-9-]*$/, "Barcode may contain letters, digits and dashes").optional(),
).transform((v) => (v ? v : null));

const percentToBps = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? "0" : v),
  z.coerce.number().min(0).max(100).transform((p) => Math.round(p * 100)),
);

export const productInputSchema = z.object({
  id: optionalUuidSchema,
  sku: skuSchema,
  barcode: barcodeSchema,
  name: z.string().trim().min(1, "Name is required").max(200),
  description: optionalTextSchema(2000),
  categoryId: optionalUuidSchema,
  brand: optionalTextSchema(100),
  unit: unitSchema,
  allowFractional: checkboxSchema,
  costPaisa: moneyInputSchema.refine((p) => p >= 0, "Cost cannot be negative"),
  pricePaisa: moneyInputSchema.refine((p) => p >= 0, "Price cannot be negative"),
  taxRateBps: percentToBps,
  reorderLevel: quantitySchema,
  reorderQty: quantitySchema,
  supplierId: optionalUuidSchema,
  imageUrl: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  imagePathname: optionalTextSchema(500),
  status: productStatusSchema,
  initialStock: z.preprocess((v) => (v === "" || v == null ? "0" : v), quantitySchema),
  tracksExpiry: checkboxSchema,
  shelfLifeDays: shelfLifeSchema,
  expiryWarningDays: warningDaysSchema,
  initialBatchCode: optionalTextSchema(60),
  initialExpiry: optionalDateSchema,
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z.object({
  id: optionalUuidSchema,
  name: z.string().trim().min(1, "Name is required").max(80),
});

export const productListParamsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: optionalUuidSchema,
  supplier: optionalUuidSchema,
  status: z.enum(["active", "draft", "archived", "all"]).default("active"),
  low: z.enum(["1"]).optional(),
  expiry: z.enum(["expired", "soon", "missing"]).optional(),
  sort: z.enum(["name", "sku", "price", "stock", "updated"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ProductListParams = z.infer<typeof productListParamsSchema>;

/** One CSV row after header normalisation (lower-case, trimmed). */
export const importRowSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1, "name is required").max(200),
  barcode: barcodeSchema,
  category: optionalTextSchema(80),
  brand: optionalTextSchema(100),
  unit: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : "pcs"), unitSchema),
  allow_fractional: z.preprocess((v) => ["1", "true", "yes", "y"].includes(String(v ?? "").trim().toLowerCase()), z.boolean()),
  cost: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "0" : v), moneyInputSchema),
  price: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "0" : v), moneyInputSchema),
  tax_rate_percent: percentToBps,
  reorder_level: z.preprocess((v) => (v === "" || v == null ? "0" : v), quantitySchema),
  reorder_qty: z.preprocess((v) => (v === "" || v == null ? "0" : v), quantitySchema),
  supplier: optionalTextSchema(120),
  status: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : "active"), productStatusSchema),
  stock_qty: z.preprocess((v) => (v === "" || v == null ? "0" : v), quantitySchema),
  description: optionalTextSchema(2000),
  // Blank = leave unchanged on update (older CSVs have no expiry columns).
  tracks_expiry: z.preprocess((v) => (String(v ?? "").trim() === "" ? null : ["1", "true", "yes", "y"].includes(String(v).trim().toLowerCase())), z.boolean().nullable()),
  shelf_life_days: shelfLifeSchema,
  initial_expiry: optionalDateSchema,
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const assignBarcodeSchema = z.object({ productId: uuidSchema, barcode: barcodeSchema });

/** Shape of an already-parsed import row (carried between the preview and commit steps). */
export const importRowParsedSchema = z.object({
  sku: skuSchema,
  name: z.string().min(1).max(200),
  barcode: z.string().max(64).nullable(),
  category: z.string().max(80).nullable(),
  brand: z.string().max(100).nullable(),
  unit: unitSchema,
  allow_fractional: z.boolean(),
  cost: z.number().int().min(0),
  price: z.number().int().min(0),
  tax_rate_percent: z.number().int().min(0).max(10000),
  reorder_level: z.number().min(0),
  reorder_qty: z.number().min(0),
  supplier: z.string().max(120).nullable(),
  status: productStatusSchema,
  stock_qty: z.number().min(0),
  description: z.string().max(2000).nullable(),
  tracks_expiry: z.boolean().nullable().default(null),
  shelf_life_days: z.number().int().min(1).max(3650).nullable().default(null),
  initial_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});
