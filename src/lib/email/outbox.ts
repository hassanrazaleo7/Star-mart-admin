import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { emailOutbox, type EmailTemplate } from "@/db/schema";

export type OutboxInput = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  template: EmailTemplate;
  /** Ids only; the template loads fresh data when the email is sent. */
  payload: Record<string, unknown>;
  createdBy?: string | null;
  scheduledFor?: Date | null;
};

/** Batch item that queues an email together with the business write it belongs to. */
export function buildEmailInsert(input: OutboxInput): BatchItem<"pg"> {
  return db.insert(emailOutbox).values({
    toEmail: input.toEmail.trim().toLowerCase(),
    toName: input.toName ?? null,
    subject: input.subject.slice(0, 200),
    template: input.template,
    payload: input.payload,
    createdBy: input.createdBy ?? null,
    scheduledFor: input.scheduledFor ?? sql`now()`,
  });
}

export async function enqueueEmail(input: OutboxInput): Promise<string | null> {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      toEmail: input.toEmail.trim().toLowerCase(),
      toName: input.toName ?? null,
      subject: input.subject.slice(0, 200),
      template: input.template,
      payload: input.payload,
      createdBy: input.createdBy ?? null,
      scheduledFor: input.scheduledFor ?? sql`now()`,
    })
    .returning({ id: emailOutbox.id });
  return row?.id ?? null;
}
