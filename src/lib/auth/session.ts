import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { suppliers, type AdminRole } from "@/db/schema";
import { SESSION_IDLE_SECONDS, SESSION_TOUCH_INTERVAL_MS } from "./constants";
import { getClientIp, getUserAgent, type RequestMeta } from "./request-meta";
import { loadSessionWithUser, revokeSession, touchSession, type RevokeReason } from "./sessions-store";

export type AuthContext = {
  user: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    mustChangePassword: boolean;
    supplierId: string | null;
  };
  sid: string;
};

/**
 * The authoritative session check. The proxy only validates the JWT; this
 * function confirms the matching admin_sessions row is still alive, the user is
 * still active, and the token's session version is current. Cached per request.
 */
export const getCurrentSession = cache(async (): Promise<AuthContext | null> => {
  const session = await auth();
  if (!session?.sid || !session.user?.id) return null;

  const row = await loadSessionWithUser(session.sid);
  if (!row || row.revokedAt) return null;

  const now = Date.now();
  let deadReason: RevokeReason | null = null;
  if (row.userId !== session.user.id) deadReason = "mismatch";
  else if (row.expiresAt.getTime() <= now) deadReason = "expired";
  else if (now - row.lastSeenAt.getTime() > SESSION_IDLE_SECONDS * 1000) deadReason = "idle";
  else if (!row.user.isActive) deadReason = "user_disabled";
  else if (row.user.sessionVersion !== session.sv) deadReason = "stale_version";

  if (deadReason) {
    await revokeSession(row.id, deadReason);
    return null;
  }

  if (now - row.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await touchSession(row.id);
  }

  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      mustChangePassword: row.user.mustChangePassword,
      supplierId: row.user.supplierId,
    },
    sid: row.id,
  };
});

type RequireOptions = { allowPasswordChangeRequired?: boolean };

const securityPathFor = (role: AdminRole) => (role === "vendor" ? "/vendor/security" : "/settings/security");

/** Call first in every page and server action. */
export async function requireSession(options: RequireOptions = {}): Promise<AuthContext> {
  const ctx = await getCurrentSession();
  // A page render cannot clear cookies, so a dead session is sent to a route
  // handler that signs out and redirects to /login (prevents a redirect loop).
  if (!ctx) redirect("/api/session/expire");
  if (ctx.user.mustChangePassword && !options.allowPasswordChangeRequired) {
    redirect(`${securityPathFor(ctx.user.role)}?reason=must_change`);
  }
  return ctx;
}

/** Accepts one role or a list; any other role gets a 404 (the page's existence is not revealed). */
export async function requireRole(
  roles: AdminRole | readonly AdminRole[],
  options: RequireOptions = {},
): Promise<AuthContext> {
  const ctx = await requireSession(options);
  const allowed = typeof roles === "string" ? [roles] : roles;
  if (!allowed.includes(ctx.user.role)) notFound();
  return ctx;
}

export type VendorContext = AuthContext & { supplierId: string; supplierName: string };

const loadSupplierStatus = cache(async (supplierId: string) => {
  const [row] = await db
    .select({ id: suppliers.id, name: suppliers.name, isActive: suppliers.isActive })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  return row ?? null;
});

/** Vendor portal guard: a vendor user linked to an active supplier. */
export async function requireVendor(options: RequireOptions = {}): Promise<VendorContext> {
  const ctx = await requireRole("vendor", options);
  if (!ctx.user.supplierId) notFound();
  const supplier = await loadSupplierStatus(ctx.user.supplierId);
  if (!supplier || !supplier.isActive) notFound();
  return { ...ctx, supplierId: supplier.id, supplierName: supplier.name };
}

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  return { ip: getClientIp(h), userAgent: getUserAgent(h) };
}
