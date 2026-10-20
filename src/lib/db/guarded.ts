import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

/**
 * Guarded writes for the transaction-less Neon HTTP driver.
 *
 * `db.batch([...])` runs as one implicit transaction, but an UPDATE that
 * matches zero rows does not fail it. To make a guard fatal, the guard runs as
 * a data-modifying CTE `g` and the dependent statement writes `(select now()
 * from g)` into a NOT NULL column: when the guard matched nothing the value is
 * NULL, Postgres raises 23502 and the whole batch rolls back. Callers map that
 * error back to a human message (see src/lib/db-errors.ts).
 */

/** Value for a NOT NULL timestamp column that is only non-null when the guard matched. */
export const ANCHOR = sql`(select now() from g)`;

/**
 * Builds `with g as (<guard>) <dependent>` as a single executable batch item.
 * `guard` must be an UPDATE/INSERT ... RETURNING; `dependent` must reference ANCHOR.
 */
export function guarded(guard: SQL, dependent: SQL) {
  return db.execute(sql`with g as (${guard}) ${dependent}`);
}
