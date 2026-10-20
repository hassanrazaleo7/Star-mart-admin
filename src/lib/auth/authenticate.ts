import { eq } from "drizzle-orm";
import type { User } from "next-auth";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { audit } from "./audit";
import { RATE_LIMIT_PER_EMAIL, RATE_LIMIT_PER_IP } from "./constants";
import { InvalidCredentialsError, RateLimitedError } from "./errors";
import { recordFailedLogin, resetLoginCounters } from "./lockout";
import { burnPasswordVerification, verifyPassword } from "./password";
import { emailKey, hitLoginCounter, ipKey } from "./rate-limit";
import { getClientIp, getUserAgent } from "./request-meta";
import { createSession } from "./sessions-store";
import { loginSchema } from "./validation";

/**
 * The single place that decides whether a login succeeds. It is wired to the
 * Auth.js Credentials provider, so it also protects direct POSTs to
 * /api/auth/callback/credentials that bypass the login form's server action.
 *
 * Every failure path returns the same generic error to the client; the real
 * reason is only recorded in the audit log.
 */
export async function authenticate(
  credentials: Partial<Record<string, unknown>>,
  request: Request,
): Promise<User> {
  const meta = { ip: getClientIp(request.headers), userAgent: getUserAgent(request.headers) };

  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) {
    await audit("login.failed", { ...meta, metadata: { reason: "malformed_input" } });
    throw new InvalidCredentialsError();
  }
  const { email, password } = parsed.data;

  // Throttle before doing any expensive work, so attackers pay for every attempt.
  const [ipHits, emailHits] = await Promise.all([
    hitLoginCounter(ipKey(meta.ip)),
    hitLoginCounter(emailKey(email)),
  ]);
  if (ipHits > RATE_LIMIT_PER_IP || emailHits > RATE_LIMIT_PER_EMAIL) {
    await audit("login.rate_limited", { ...meta, metadata: { email, ipHits, emailHits } });
    throw new RateLimitedError();
  }

  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });

  if (!user) {
    await burnPasswordVerification(password); // uniform timing: no account enumeration
    await audit("login.failed", { ...meta, metadata: { email, reason: "unknown_email" } });
    throw new InvalidCredentialsError();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await burnPasswordVerification(password);
    await audit("login.locked", {
      ...meta,
      targetUserId: user.id,
      metadata: { lockedUntil: user.lockedUntil.toISOString() },
    });
    throw new InvalidCredentialsError();
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);

  if (!user.isActive) {
    await audit("login.failed", { ...meta, targetUserId: user.id, metadata: { reason: "disabled" } });
    throw new InvalidCredentialsError();
  }

  if (!passwordOk) {
    const result = await recordFailedLogin(user.id);
    const nowLocked = !!result?.lockedUntil && result.lockedUntil.getTime() > Date.now();
    await audit("login.failed", {
      ...meta,
      targetUserId: user.id,
      metadata: {
        reason: "bad_password",
        failedLoginCount: result?.failedLoginCount ?? null,
        ...(nowLocked ? { lockedUntil: result?.lockedUntil?.toISOString() } : {}),
      },
    });
    throw new InvalidCredentialsError();
  }

  const sid = await createSession({ userId: user.id, ip: meta.ip, userAgent: meta.userAgent });
  await resetLoginCounters(user.id);
  await audit("login.success", { ...meta, actorUserId: user.id, metadata: { sid } });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sid,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
  };
}
