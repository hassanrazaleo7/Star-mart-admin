import { z } from "zod";
import { ADMIN_ROLES } from "@/db/schema";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./constants";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((p) => p.trim() === p, "Password must not start or end with whitespace");

export function newPasswordSchema(email: string) {
  const lowered = email.toLowerCase();
  const local = lowered.split("@")[0] ?? "";
  return passwordSchema.refine(
    (p) => p.toLowerCase() !== lowered && (local.length < 4 || !p.toLowerCase().includes(local)),
    "Password must not contain your email address",
  );
}

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const uuidSchema = z.uuid();
export const roleSchema = z.enum(ADMIN_ROLES);

export const createAdminSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Name is required").max(100),
  role: roleSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
