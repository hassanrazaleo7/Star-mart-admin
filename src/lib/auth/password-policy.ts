import { env } from "@/env";
import { isPasswordPwned } from "@/lib/security/hibp";
import { newPasswordSchema } from "./validation";

/** Returns an error message, or null when the password is acceptable. */
export async function checkPasswordPolicy(password: string, email: string): Promise<string | null> {
  const result = newPasswordSchema(email).safeParse(password);
  if (!result.success) return result.error.issues[0]?.message ?? "Password does not meet the policy";
  if (env.PASSWORD_HIBP_CHECK) {
    const pwned = await isPasswordPwned(password);
    if (pwned === true) return "This password appears in a known data breach. Choose a different one.";
  }
  return null;
}
