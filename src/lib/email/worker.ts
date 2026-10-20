import "server-only";
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailOutbox, type EmailOutboxRow } from "@/db/schema";
import { sendViaBrevo } from "./brevo";
import { renderEmail } from "./templates";

const MAX_ATTEMPTS = 5;
const BACKOFF_SECONDS = [60, 300, 1800, 7200, 14400];
const STUCK_MINUTES = 10;

export type SendSummary = { claimed: number; sent: number; failed: number; rescheduled: number };

/** Returns stuck `sending` rows (crashed worker) to the queue. */
async function reapStuck(): Promise<number> {
  const rows = await db
    .update(emailOutbox)
    .set({ status: "pending", lastError: "Reset after a stalled send attempt" })
    .where(and(eq(emailOutbox.status, "sending"), lt(emailOutbox.updatedAt, sql`now() - make_interval(mins => ${STUCK_MINUTES})`)))
    .returning({ id: emailOutbox.id });
  return rows.length;
}

/** Atomically claims up to `limit` due rows so concurrent workers never double-send. */
async function claim(limit: number): Promise<EmailOutboxRow[]> {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.scheduledFor, sql`now()`)))
    .orderBy(emailOutbox.scheduledFor)
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(emailOutbox)
    .set({ status: "sending", attempts: sql`${emailOutbox.attempts} + 1`, updatedAt: sql`now()` })
    .where(inArray(emailOutbox.id, due))
    .returning();
}

/**
 * Sends due emails one at a time. Safe to call from `after()`, a cron job or a
 * button: it never throws and every row ends up sent, rescheduled or failed.
 */
export async function sendPending(options: { limit?: number } = {}): Promise<SendSummary> {
  const summary: SendSummary = { claimed: 0, sent: 0, failed: 0, rescheduled: 0 };
  try {
    await reapStuck();
    const rows = await claim(Math.max(1, Math.min(options.limit ?? 5, 100)));
    summary.claimed = rows.length;
    for (const row of rows) {
      try {
        const rendered = await renderEmail(row.template, row.payload);
        if (!rendered) {
          await db.update(emailOutbox).set({ status: "failed", lastError: "Nothing to render (record deleted?)", updatedAt: sql`now()` }).where(eq(emailOutbox.id, row.id));
          summary.failed++;
          continue;
        }
        const result = await sendViaBrevo({ toEmail: row.toEmail, toName: row.toName, subject: row.subject || rendered.subject, html: rendered.html, text: rendered.text, attachments: rendered.attachments });
        if (result.ok) {
          await db.update(emailOutbox).set({ status: "sent", sentAt: sql`now()`, providerMessageId: result.messageId, lastError: null, updatedAt: sql`now()` }).where(eq(emailOutbox.id, row.id));
          summary.sent++;
        } else if (result.retryable && row.attempts < MAX_ATTEMPTS) {
          const delay = result.retryAfterSeconds ?? BACKOFF_SECONDS[Math.min(row.attempts - 1, BACKOFF_SECONDS.length - 1)]!;
          await db.update(emailOutbox).set({ status: "pending", scheduledFor: sql`now() + make_interval(secs => ${delay})`, lastError: result.error, updatedAt: sql`now()` }).where(eq(emailOutbox.id, row.id));
          summary.rescheduled++;
        } else {
          await db.update(emailOutbox).set({ status: "failed", lastError: result.error, updatedAt: sql`now()` }).where(eq(emailOutbox.id, row.id));
          summary.failed++;
        }
      } catch (error) {
        const message = (error instanceof Error ? error.message : "Unexpected error").slice(0, 300);
        await db.update(emailOutbox).set({ status: row.attempts < MAX_ATTEMPTS ? "pending" : "failed", scheduledFor: sql`now() + make_interval(secs => ${BACKOFF_SECONDS[Math.min(row.attempts - 1, BACKOFF_SECONDS.length - 1)]})`, lastError: message, updatedAt: sql`now()` }).where(eq(emailOutbox.id, row.id)).catch(() => {});
        if (row.attempts < MAX_ATTEMPTS) summary.rescheduled++;
        else summary.failed++;
      }
    }
  } catch (error) {
    console.error("[email] worker error", error);
  }
  return summary;
}
