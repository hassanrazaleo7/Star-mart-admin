import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { adminLoginAttempts } from "@/db/schema";
import { RATE_WINDOW_MINUTES } from "./constants";

const windowInterval = sql.raw(`interval '${RATE_WINDOW_MINUTES} minutes'`);

/**
 * Increments the fixed-window counter for `key` and returns the new count.
 * One upsert statement does both the reset and the increment, so it is safe on
 * the transaction-less Neon HTTP driver and under concurrency. Fails closed.
 */
export async function hitLoginCounter(key: string): Promise<number> {
  const expired = sql`${adminLoginAttempts.windowStart} < now() - ${windowInterval}`;
  const [row] = await db
    .insert(adminLoginAttempts)
    .values({ key, count: 1, windowStart: sql`now()` })
    .onConflictDoUpdate({
      target: adminLoginAttempts.key,
      set: {
        count: sql`case when ${expired} then 1 else ${adminLoginAttempts.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${adminLoginAttempts.windowStart} end`,
      },
    })
    .returning({ count: adminLoginAttempts.count });
  return row?.count ?? Number.MAX_SAFE_INTEGER;
}

export const ipKey = (ip: string) => `ip:${ip}`;
export const emailKey = (email: string) =>
  `email:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`;

/** Opportunistic garbage collection; safe to call from anywhere. */
export async function cleanupLoginAttempts(): Promise<void> {
  await db
    .delete(adminLoginAttempts)
    .where(sql`${adminLoginAttempts.windowStart} < now() - interval '1 day'`);
}
