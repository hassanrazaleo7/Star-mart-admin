/**
 * Creates (or resets) an administrator account from the terminal.
 *
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_NAME="Owner" SEED_ADMIN_PASSWORD='...' npm run seed:admin
 *   npm run seed:admin -- --email you@example.com --name "Owner" --password-stdin < pw.txt
 *   npm run seed:admin -- --email you@example.com --reset-password --password-stdin < pw.txt
 *
 * Idempotent: an existing email is left untouched unless --reset-password or
 * --activate is passed. Prefer --password-stdin or the env var over --password,
 * which would land in your shell history. --must-change-password forces the
 * user to pick a new password at first sign-in.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { adminSessions, adminUsers } from "../src/db/schema";
import { audit } from "../src/lib/auth/audit";
import { checkPasswordPolicy } from "../src/lib/auth/password-policy";
import { hashPassword } from "../src/lib/auth/password";
import { cleanupLoginAttempts } from "../src/lib/auth/rate-limit";
import { emailSchema, roleSchema } from "../src/lib/auth/validation";

function fail(message: string, code = 1): never {
  console.error(`seed:admin: ${message}`);
  process.exit(code);
}

async function readStdinLine(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0] ?? "";
}

async function main() {
  const { values: flags } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
      "password-stdin": { type: "boolean", default: false },
      role: { type: "string", default: "super_admin" },
      "reset-password": { type: "boolean", default: false },
      activate: { type: "boolean", default: false },
      "must-change-password": { type: "boolean", default: false },
    },
  });

  const emailResult = emailSchema.safeParse(flags.email ?? process.env.SEED_ADMIN_EMAIL);
  if (!emailResult.success) fail("provide a valid --email (or SEED_ADMIN_EMAIL)", 2);
  const email = emailResult.data;

  const roleResult = roleSchema.safeParse(flags.role);
  if (!roleResult.success) fail("--role must be super_admin or admin", 2);
  const role = roleResult.data;

  const name = (flags.name ?? process.env.SEED_ADMIN_NAME ?? "").trim();
  const mustChangePassword = flags["must-change-password"];

  const rawPassword = flags["password-stdin"]
    ? await readStdinLine()
    : (flags.password ?? process.env.SEED_ADMIN_PASSWORD ?? "");
  const password = rawPassword.replace(/\r?\n$/, "");

  const existing = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });

  if (existing && !flags["reset-password"] && !flags.activate) {
    console.log(`User ${email} already exists; nothing to do (use --reset-password or --activate).`);
    return;
  }

  if (existing && flags.activate && !flags["reset-password"]) {
    await db.update(adminUsers).set({ isActive: true, updatedAt: sql`now()` }).where(eq(adminUsers.id, existing.id));
    await audit("user.enabled", { targetUserId: existing.id, metadata: { source: "seed" } });
    console.log(`Activated ${email}.`);
    return;
  }

  if (!password) fail("provide a password via --password-stdin, --password or SEED_ADMIN_PASSWORD", 2);
  const policyError = await checkPasswordPolicy(password, email);
  if (policyError) fail(policyError, 2);

  const passwordHash = await hashPassword(password);

  if (existing) {
    await db.batch([
      db
        .update(adminUsers)
        .set({
          passwordHash,
          passwordChangedAt: sql`now()`,
          sessionVersion: sql`${adminUsers.sessionVersion} + 1`,
          failedLoginCount: 0,
          lockedUntil: null,
          mustChangePassword,
          isActive: flags.activate ? true : existing.isActive,
          updatedAt: sql`now()`,
        })
        .where(eq(adminUsers.id, existing.id)),
      db
        .update(adminSessions)
        .set({ revokedAt: sql`now()`, revokedReason: "password_change" })
        .where(eq(adminSessions.userId, existing.id)),
    ]);
    await audit("password.reset_by_admin", { targetUserId: existing.id, metadata: { source: "seed" } });
    console.log(`Password reset for ${email}; all sessions revoked.`);
  } else {
    if (!name) fail("provide --name (or SEED_ADMIN_NAME) for a new user", 2);
    const [created] = await db
      .insert(adminUsers)
      .values({ email, name, passwordHash, role, isActive: true, mustChangePassword })
      .returning({ id: adminUsers.id });
    await audit("user.created", { targetUserId: created?.id, metadata: { source: "seed", role } });
    console.log(`Created ${role} ${email}${mustChangePassword ? " (must change password at first sign-in)" : ""}.`);
  }

  await cleanupLoginAttempts().catch(() => undefined);
}

main().catch((error) => {
  console.error("seed:admin failed:", error);
  process.exit(1);
});
