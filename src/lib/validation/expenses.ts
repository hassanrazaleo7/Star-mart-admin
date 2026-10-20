import { z } from "zod";
import { EXPENSE_METHODS } from "@/db/schema";
import { positiveMoneySchema } from "@/lib/money";
import { blankToUndefined, isoDateSchema, optionalTextSchema, optionalUuidSchema, uuidSchema } from "./common";

export const expenseSchema = z.object({
  id: optionalUuidSchema,
  categoryId: uuidSchema,
  description: z.string().trim().min(1, "Description is required").max(200),
  amountPaisa: positiveMoneySchema,
  method: z.enum(EXPENSE_METHODS),
  reference: optionalTextSchema(100),
  incurredAt: isoDateSchema,
  receiptUrl: z.preprocess(blankToUndefined, z.url("Enter a full URL").max(500).optional()).transform((v) => v ?? null),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseCategorySchema = z.object({
  id: optionalUuidSchema,
  name: z.string().trim().min(1, "Name is required").max(80),
});

export const expenseListParamsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: optionalUuidSchema,
  method: z.enum([...EXPENSE_METHODS, ""]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ExpenseListParams = z.infer<typeof expenseListParamsSchema>;
