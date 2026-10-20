import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { SESSION_ABSOLUTE_SECONDS } from "./constants";

export type RevokeReason =
  | "logout"
  | "password_change"
  | "admin"
  | "user"
  | "idle"
  | "expired"
  | "user_disabled"
  | "stale_version"
  | "mismatch";

export async function createSession(input: {
  userId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(adminSessions)
    .values({
      userId: input.userId,
      ip: input.ip,
      userAgent: input.userAgent,
      expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_SECONDS * 1000),
    })
    .returning({ id: adminSessions.id });
  if (!row) throw new Error("Failed to create session");
  return row.id;
}

export async function loadSessionWithUser(sessionId: string) {
  const [row] = await db
    .select({
      id: adminSessions.id,
      userId: adminSessions.userId,
      createdAt: adminSessions.createdAt,
      lastSeenAt: adminSessions.lastSeenAt,
      expiresAt: adminSessions.expiresAt,
      revokedAt: adminSessions.revokedAt,
      user: {
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        isActive: adminUsers.isActive,
        sessionVersion: adminUsers.sessionVersion,
        mustChangePassword: adminUsers.mustChangePassword,
        supplierId: adminUsers.supplierId,
      },
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(eq(adminSessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

export async function touchSession(sessionId: string): Promise<void> {
  await db
    .update(adminSessions)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(adminSessions.id, sessionId));
}

/** Revokes one session; when `userId` is given the row must belong to that user. */
export async function revokeSession(
  sessionId: string,
  reason: RevokeReason,
  userId?: string,
): Promise<number> {
  const rows = await db
    .update(adminSessions)
    .set({ revokedAt: sql`now()`, revokedReason: reason })
    .where(
      and(
        eq(adminSessions.id, sessionId),
        isNull(adminSessions.revokedAt),
        userId ? eq(adminSessions.userId, userId) : undefined,
      ),
    )
    .returning({ id: adminSessions.id });
  return rows.length;
}

export async function revokeAllSessionsForUser(
  userId: string,
  reason: RevokeReason,
  exceptSessionId?: string,
): Promise<number> {
  const rows = await db
    .update(adminSessions)
    .set({ revokedAt: sql`now()`, revokedReason: reason })
    .where(
      and(
        eq(adminSessions.userId, userId),
        isNull(adminSessions.revokedAt),
        exceptSessionId ? ne(adminSessions.id, exceptSessionId) : undefined,
      ),
    )
    .returning({ id: adminSessions.id });
  return rows.length;
}

export async function listActiveSessions(userId: string) {
  return db
    .select({
      id: adminSessions.id,
      createdAt: adminSessions.createdAt,
      lastSeenAt: adminSessions.lastSeenAt,
      expiresAt: adminSessions.expiresAt,
      ip: adminSessions.ip,
      userAgent: adminSessions.userAgent,
    })
    .from(adminSessions)
    .where(
      and(
        eq(adminSessions.userId, userId),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(adminSessions.createdAt));
}
