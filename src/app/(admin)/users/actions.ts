"use server";

import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { unlockUser } from "@/lib/auth/lockout";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { revokeAllSessionsForUser } from "@/lib/auth/sessions-store";
import { uuidSchema } from "@/lib/auth/validation";
import { isUniqueViolation } from "@/lib/db-errors";
import { firstIssue } from "@/lib/validation/common";
import { createUserSchema, setUserRoleSchema } from "@/lib/validation/users";

const USERS = "/users";

// Another active super admin can never remove the last one, but keep the
// invariant in SQL anyway so it holds under concurrent changes.
const anotherActiveSuperAdminExists = sql`(select count(*) from ${adminUsers} u where u.role = 'super_admin' and u.is_active) > 1`;

function parseUserId(formData: FormData): string {
  const parsed = uuidSchema.safeParse(formData.get("userId"));
  if (!parsed.success) redirect(`${USERS}?status=not_found`);
  return parsed.data;
}

export type CreateUserState = {
  error: string | null;
  created?: { email: string; name: string; tempPassword: string };
};

export async function createUserAction(_previous: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const ctx = await requireRole("super_admin");
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    supplierId: formData.get("supplierId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const meta = await getRequestMeta();
  const supplierId = parsed.data.role === "vendor" ? (parsed.data.supplierId ?? null) : null;

  try {
    const [created] = await db
      .insert(adminUsers)
      .values({
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        supplierId,
        passwordHash,
        mustChangePassword: true,
        createdBy: ctx.user.id,
      })
      .returning({ id: adminUsers.id });
    await audit("user.created", {
      ...meta,
      actorUserId: ctx.user.id,
      targetUserId: created?.id,
      metadata: { role: parsed.data.role, supplierId },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "A user with that email already exists." };
    throw error;
  }

  revalidatePath(USERS);
  return { error: null, created: { email: parsed.data.email, name: parsed.data.name, tempPassword } };
}

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("super_admin");
  const userId = parseUserId(formData);
  const activate = formData.get("active") === "true";
  if (userId === ctx.user.id) redirect(`${USERS}?status=forbidden_self`);
  const meta = await getRequestMeta();

  if (activate) {
    const rows = await db
      .update(adminUsers)
      .set({ isActive: true, updatedAt: sql`now()` })
      .where(and(eq(adminUsers.id, userId), ne(adminUsers.id, ctx.user.id)))
      .returning({ id: adminUsers.id });
    if (!rows.length) redirect(`${USERS}?status=not_found`);
    await audit("user.enabled", { ...meta, actorUserId: ctx.user.id, targetUserId: userId });
    redirect(`${USERS}?status=user_enabled`);
  }

  const rows = await db
    .update(adminUsers)
    .set({ isActive: false, updatedAt: sql`now()` })
    .where(
      and(
        eq(adminUsers.id, userId),
        ne(adminUsers.id, ctx.user.id),
        or(ne(adminUsers.role, "super_admin"), anotherActiveSuperAdminExists),
      ),
    )
    .returning({ id: adminUsers.id });
  if (!rows.length) {
    const exists = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
    redirect(`${USERS}?status=${exists ? "last_super_admin" : "not_found"}`);
  }
  const revoked = await revokeAllSessionsForUser(userId, "user_disabled");
  await audit("user.disabled", { ...meta, actorUserId: ctx.user.id, targetUserId: userId, metadata: { revokedSessions: revoked } });
  redirect(`${USERS}?status=user_disabled`);
}

export type SetRoleState = { error: string | null };

export async function setUserRoleAction(_previous: SetRoleState, formData: FormData): Promise<SetRoleState> {
  const ctx = await requireRole("super_admin");
  const parsed = setUserRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    supplierId: formData.get("supplierId"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { userId, role } = parsed.data;
  if (userId === ctx.user.id) return { error: "You cannot change your own role." };
  const supplierId = role === "vendor" ? (parsed.data.supplierId ?? null) : null;
  const meta = await getRequestMeta();

  const rows = await db
    .update(adminUsers)
    .set({ role, supplierId, updatedAt: sql`now()` })
    .where(
      and(
        eq(adminUsers.id, userId),
        ne(adminUsers.id, ctx.user.id),
        or(eq(adminUsers.role, role), ne(adminUsers.role, "super_admin"), anotherActiveSuperAdminExists),
      ),
    )
    .returning({ id: adminUsers.id });
  if (!rows.length) {
    const exists = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
    return { error: exists ? "There must always be at least one active super admin." : "That user no longer exists." };
  }
  // A role change alters what the session is allowed to do: sign them out everywhere.
  await revokeAllSessionsForUser(userId, "admin");
  await audit("user.role_changed", { ...meta, actorUserId: ctx.user.id, targetUserId: userId, metadata: { role, supplierId } });
  revalidatePath(USERS);
  redirect(`${USERS}?status=role_changed`);
}

export type ResetPasswordState = { error: string | null; tempPassword?: string; email?: string };

export async function resetUserPasswordAction(_previous: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const ctx = await requireRole("super_admin");
  const parsed = uuidSchema.safeParse(formData.get("userId"));
  if (!parsed.success) return { error: "Invalid user." };
  if (parsed.data === ctx.user.id) return { error: "Use the Security page to change your own password." };

  const target = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, parsed.data) });
  if (!target) return { error: "That user no longer exists." };

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const meta = await getRequestMeta();
  await db.batch([
    db
      .update(adminUsers)
      .set({
        passwordHash,
        passwordChangedAt: sql`now()`,
        sessionVersion: sql`${adminUsers.sessionVersion} + 1`,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: sql`now()`,
      })
      .where(eq(adminUsers.id, target.id)),
    db
      .update(adminSessions)
      .set({ revokedAt: sql`now()`, revokedReason: "admin" })
      .where(and(eq(adminSessions.userId, target.id), isNull(adminSessions.revokedAt))),
  ]);
  await audit("password.reset_by_admin", { ...meta, actorUserId: ctx.user.id, targetUserId: target.id });
  revalidatePath(USERS);
  return { error: null, tempPassword, email: target.email };
}

export async function unlockUserAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("super_admin");
  const userId = parseUserId(formData);
  const meta = await getRequestMeta();
  await unlockUser(userId);
  await audit("user.unlocked", { ...meta, actorUserId: ctx.user.id, targetUserId: userId });
  redirect(`${USERS}?status=user_unlocked`);
}

export async function revokeUserSessionsAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("super_admin");
  const userId = parseUserId(formData);
  const meta = await getRequestMeta();
  const count = await revokeAllSessionsForUser(userId, "admin");
  await audit("sessions.revoked_all", { ...meta, actorUserId: ctx.user.id, targetUserId: userId, metadata: { count } });
  redirect(`${USERS}?status=user_sessions_revoked`);
}
