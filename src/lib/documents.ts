import { sql } from "drizzle-orm";
import { db } from "@/db";
import { documentCounters } from "@/db/schema";

/**
 * Returns the next sequential number for a document series, e.g. "INV-000042".
 * One upsert statement, safe under concurrency. Call it BEFORE building the
 * batch that inserts the document; a gap after a failed batch is acceptable.
 */
export async function nextDocumentNumber(series: string, prefix = series, width = 6): Promise<string> {
  const [row] = await db
    .insert(documentCounters)
    .values({ name: series, value: 1 })
    .onConflictDoUpdate({ target: documentCounters.name, set: { value: sql`${documentCounters.value} + 1` } })
    .returning({ value: documentCounters.value });
  const value = Number(row?.value ?? 1);
  return `${prefix}-${String(value).padStart(width, "0")}`;
}

/** Numeric-only variant used for EAN-13 generation. */
export async function nextCounterValue(series: string): Promise<number> {
  const [row] = await db
    .insert(documentCounters)
    .values({ name: series, value: 1 })
    .onConflictDoUpdate({ target: documentCounters.name, set: { value: sql`${documentCounters.value} + 1` } })
    .returning({ value: documentCounters.value });
  return Number(row?.value ?? 1);
}
