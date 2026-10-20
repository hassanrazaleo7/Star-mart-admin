"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { emailSchema } from "@/lib/auth/validation";
import { enqueueEmail } from "@/lib/email/outbox";
import { scheduleEmailWork } from "@/lib/email/schedule";
import { sendPending } from "@/lib/email/worker";
import { ROLE_GROUPS } from "@/lib/rbac";
import { uuidSchema } from "@/lib/validation/common";

export type TestEmailState = { error: string | null; ok?: boolean };

export async function sendTestEmailAction(_previous: TestEmailState, formData: FormData): Promise<TestEmailState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const id = await enqueueEmail({ toEmail: parsed.data, subject: "Test email", template: "test_email", payload: {}, createdBy: ctx.user.id });
  const meta = await getRequestMeta();
  await audit("email.test_sent", { ...meta, actorUserId: ctx.user.id, metadata: { to: parsed.data, outboxId: id } });
  await sendPending({ limit: 5 }); // inline so the result shows immediately
  revalidatePath("/settings/email");
  return { error: null, ok: true };
}

export async function retryEmailsAction(formData: FormData): Promise<void> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const single = uuidSchema.safeParse(formData.get("outboxId"));
  const all = formData.get("scope") === "failed";
  if (!single.success && !all) redirect("/settings/email");
  const ids = single.success
    ? [single.data]
    : (await db.select({ id: emailOutbox.id }).from(emailOutbox).where(eq(emailOutbox.status, "failed")).limit(200)).map((r) => r.id);
  if (ids.length) {
    await db.update(emailOutbox).set({ status: "pending", scheduledFor: sql`now()`, attempts: 0, lastError: null, updatedAt: sql`now()` }).where(inArray(emailOutbox.id, ids));
    const meta = await getRequestMeta();
    await audit("email.retried", { ...meta, actorUserId: ctx.user.id, metadata: { count: ids.length, scope: all ? "failed" : "single" } });
    scheduleEmailWork();
  }
  revalidatePath("/settings/email");
  redirect("/settings/email?status=emails_retried");
}

export async function runOutboxNowAction(): Promise<void> {
  await requireRole(ROLE_GROUPS.managers);
  const r = await sendPending({ limit: 25 });
  revalidatePath("/settings/email");
  redirect(`/settings/email?status=${r.claimed ? "outbox_ran" : "outbox_empty"}`);
}

