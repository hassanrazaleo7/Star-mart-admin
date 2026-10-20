import "server-only";
import { env } from "@/env";

export type EmailAttachment = { name: string; contentBase64: string };
export type OutgoingEmail = { toEmail: string; toName?: string | null; subject: string; html: string; text: string; attachments?: EmailAttachment[] };
export type SendResult = { ok: true; messageId: string } | { ok: false; retryable: boolean; error: string; retryAfterSeconds?: number };

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

/** Sends one email through Brevo's transactional API. Never throws; never leaks the API key. */
export async function sendViaBrevo(email: OutgoingEmail): Promise<SendResult> {
  if (env.BREVO_DRY_RUN) {
    const id = `dry-run:${crypto.randomUUID()}`;
    console.info(`[email] dry run → ${email.toEmail} "${email.subject}" (${email.attachments?.length ?? 0} attachment(s)) ${id}`);
    return { ok: true, messageId: id };
  }
  if (!env.emailConfigured) return { ok: false, retryable: false, error: "Email is not configured: set BREVO_API_KEY and BREVO_SENDER_EMAIL." };
  const body = {
    sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME ?? "Star Mart" },
    to: [{ email: email.toEmail, name: email.toName ?? undefined }],
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    attachment: email.attachments?.length ? email.attachments.map((a) => ({ name: a.name, content: a.contentBase64 })) : undefined,
  };
  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { messageId?: string };
      return { ok: true, messageId: data.messageId ?? `brevo:${Date.now()}` };
    }
    const text = (await res.text().catch(() => "")).slice(0, 300);
    const retryable = res.status === 429 || res.status >= 500;
    const retryAfter = Number(res.headers.get("retry-after"));
    return { ok: false, retryable, error: `Brevo ${res.status}: ${text || res.statusText}`, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "Network error";
    return { ok: false, retryable: true, error: message.slice(0, 300) };
  }
}
