"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { db } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getRequestMeta, requireSession } from "@/lib/auth/session";
import { revokeAllSessionsForUser, revokeSession } from "@/lib/auth/sessions-store";
import { changePasswordSchema, uuidSchema } from "@/lib/auth/validation";

export type ChangePasswordState = { error: string | null };

export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const ctx = await requireSession({ allowPasswordChangeRequired: true });
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, ctx.user.id) });
  if (!user) redirect("/api/session/expire");

  const meta = await getRequestMeta();
  if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    await audit("login.failed", {
      ...meta,
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { reason: "password_change_verification" },
    });
    return { error: "Current password is incorrect." };
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return { error: "New password must be different from the current password." };
  }
  const policyError = await checkPasswordPolicy(parsed.data.newPassword, user.email);
  if (policyError) return { error: policyError };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  // One batch = one implicit transaction on the Neon HTTP driver.
  await db.batch([
    db
      .update(adminUsers)
      .set({
        passwordHash,
        passwordChangedAt: sql`now()`,
        mustChangePassword: false,
        sessionVersion: sql`${adminUsers.sessionVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(adminUsers.id, user.id)),
    db
      .update(adminSessions)
      .set({ revokedAt: sql`now()`, revokedReason: "password_change" })
      .where(and(eq(adminSessions.userId, user.id), isNull(adminSessions.revokedAt))),
  ]);
  await audit("password.changed", { ...meta, actorUserId: user.id, targetUserId: user.id });

  // Every session (including this one) is now invalid: force a fresh sign-in.
  await signOut({ redirectTo: "/login?reason=password_changed" });
  return { error: null };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const ctx = await requireSession({ allowPasswordChangeRequired: true });
  const id = uuidSchema.safeParse(formData.get("sessionId"));
  if (!id.success) redirect("/settings/security");

  const meta = await getRequestMeta();
  const revoked = await revokeSession(id.data, "user", ctx.user.id); // scoped to the caller's own rows
  if (revoked) {
    await audit("session.revoked", {
      ...meta,
      actorUserId: ctx.user.id,
      targetUserId: ctx.user.id,
      metadata: { sid: id.data, current: id.data === ctx.sid },
    });
  }
  if (id.data === ctx.sid) await signOut({ redirectTo: "/login?reason=logged_out" });
  redirect("/settings/security?status=session_revoked");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const ctx = await requireSession({ allowPasswordChangeRequired: true });
  const meta = await getRequestMeta();
  const count = await revokeAllSessionsForUser(ctx.user.id, "user", ctx.sid);
  await audit("sessions.revoked_all", {
    ...meta,
    actorUserId: ctx.user.id,
    targetUserId: ctx.user.id,
    metadata: { count, keptSid: ctx.sid },
  });
  redirect("/settings/security?status=others_revoked");
}
