import { z } from "zod";

export const uuidSchema = z.uuid();
export const optionalUuidSchema = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.uuid().optional());
// Form fields that are not rendered arrive as null from FormData; treat them as empty.
export const optionalTextSchema = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v == null ? undefined : v), z.string().max(max).optional()).transform((v) => (v ? v : null));
export const blankToUndefined = (v: unknown) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v);
export const requiredTextSchema = (max: number, label = "This field") =>
  z.string().trim().min(1, `${label} is required`).max(max);
export const checkboxSchema = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
export const quantitySchema = z.coerce
  .number()
  .finite()
  .min(0)
  .max(999_999.999)
  .transform((q) => Math.round(q * 1000) / 1000);
export const positiveQuantitySchema = quantitySchema.refine((q) => q > 0, "Quantity must be greater than zero");
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Reads a FormData value as a trimmed string (or empty). */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** First zod issue message, for `useActionState` forms. */
export function firstIssue(error: z.ZodError, fallback = "Invalid input"): string {
  return error.issues[0]?.message ?? fallback;
}
