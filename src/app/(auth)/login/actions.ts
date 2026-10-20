"use server";

import { eq } from "drizzle-orm";
import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { loginErrorMessage } from "@/lib/auth/errors";
import { loginSchema } from "@/lib/auth/validation";
import { landingFor } from "@/lib/rbac";
import { safeCallbackUrl } from "@/lib/security/redirect";

// `email` is echoed back so the form can keep it after a failed attempt
// (React resets uncontrolled form fields once an action completes).
export type LoginState = { error: string | null; email?: string };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim().slice(0, 254) : "";
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: loginErrorMessage("invalid_credentials"), email };

  const redirectTo = safeCallbackUrl(formData.get("callbackUrl"));

  try {
    // All throttling, lockout and audit logic lives in src/lib/auth/authenticate.ts.
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof CredentialsSignin) return { error: loginErrorMessage(error.code), email };
    if (error instanceof AuthError) {
      console.error("[login] unexpected auth error", error.type);
      return { error: loginErrorMessage(null), email };
    }
    throw error;
  }

  // Land each role on a page it may open (vendors never see the admin shell).
  const user = await db.query.adminUsers.findFirst({ columns: { role: true }, where: eq(adminUsers.email, parsed.data.email) });
  redirect(landingFor(user?.role ?? "cashier", redirectTo));
}
