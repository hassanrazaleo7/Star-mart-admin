import { z } from "zod";
import { ADMIN_ROLES } from "@/db/schema";
import { emailSchema } from "@/lib/auth/validation";
import { optionalUuidSchema, uuidSchema } from "./common";

export const roleSchema = z.enum(ADMIN_ROLES);

const withSupplierRule = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).superRefine((value, ctx) => {
    const role = (value as { role: string }).role;
    const supplierId = (value as { supplierId?: string }).supplierId;
    if (role === "vendor" && !supplierId) {
      ctx.addIssue({ code: "custom", path: ["supplierId"], message: "Choose the supplier this user belongs to" });
    }
  });

export const createUserSchema = withSupplierRule({
  email: emailSchema,
  name: z.string().trim().min(1, "Name is required").max(100),
  role: roleSchema,
  supplierId: optionalUuidSchema,
});

export const setUserRoleSchema = withSupplierRule({
  userId: uuidSchema,
  role: roleSchema,
  supplierId: optionalUuidSchema,
});
