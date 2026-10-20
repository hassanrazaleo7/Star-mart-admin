import { z } from "zod";
import { SHIFT_STATUSES } from "@/db/schema";
import { moneyInputSchema } from "@/lib/money";
import { blankToUndefined, optionalTextSchema, optionalUuidSchema, uuidSchema } from "./common";

export const openShiftSchema = z.object({
  openingFloatPaisa: z.preprocess((v) => blankToUndefined(v) ?? "0", moneyInputSchema.refine((p) => p >= 0, "Float cannot be negative")),
  notes: optionalTextSchema(500),
});

export const closeShiftSchema = z.object({
  shiftId: uuidSchema,
  countedCashPaisa: moneyInputSchema.refine((p) => p >= 0, "Counted cash cannot be negative"),
  notes: optionalTextSchema(500),
});

export const shiftListParamsSchema = z.object({
  q: z.string().trim().max(40).optional(),
  cashier: optionalUuidSchema,
  status: z.enum([...SHIFT_STATUSES, "all"]).default("all"),
  variance: z.enum(["any", "nonzero", "short", "over"]).default("any"),
  range: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ShiftListParams = z.infer<typeof shiftListParamsSchema>;
