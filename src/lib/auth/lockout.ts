import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { LOCK_BASE_MINUTES, LOCK_CAP_HOURS, LOCK_THRESHOLD } from "./constants";

const threshold = sql.raw(String(LOCK_THRESHOLD));
const baseInterval = sql.raw(`interval '${LOCK_BASE_MINUTES} minutes'`);
const capInterval = sql.raw(`interval '${LOCK_CAP_HOURS} hours'`);

/**
 * Records a failed login in one UPDATE. From the 5th failure on, the account is
 * locked for 15 min, 30 min, 1 h, 2 h ... capped at 24 h. The counter is only
 * reset by a successful login or an explicit unlock, so repeated attacks escalate.
 */
export async function recordFailedLogin(userId: string) {
  const [row] = await db
    .update(adminUsers)
    .set({
      failedLoginCount: sql`${adminUsers.failedLoginCount} + 1`,
      lockedUntil: sql`case
        when ${adminUsers.failedLoginCount} + 1 >= ${threshold}
        then now() + least(${capInterval}, ${baseInterval} * power(2, ${adminUsers.failedLoginCount} + 1 - ${threshold}))
        else ${adminUsers.lockedUntil}
      end`,
      updatedAt: sql`now()`,
    })
    .where(eq(adminUsers.id, userId))
    .returning({ failedLoginCount: adminUsers.failedLoginCount, lockedUntil: adminUsers.lockedUntil });
  return row ?? null;
}

export async function resetLoginCounters(userId: string): Promise<void> {
  await db
    .update(adminUsers)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(adminUsers.id, userId));
}

export async function unlockUser(userId: string): Promise<void> {
  await db
    .update(adminUsers)
    .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: sql`now()` })
    .where(eq(adminUsers.id, userId));
}
