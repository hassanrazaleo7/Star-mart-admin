import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { checkExpiry } from "@/lib/email/expiry";
import { checkLowStock } from "@/lib/email/low-stock";
import { sendPending } from "@/lib/email/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cron entry point: drains the outbox and runs the low-stock and expiry scans. Needs CRON_SECRET. */
async function run(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const lowStock = await checkLowStock();
  const expiry = await checkExpiry();
  const sent = await sendPending({ limit: 25 });
  return Response.json({ ok: true, lowStock, expiry, email: sent, at: new Date().toISOString() });
}

export const GET = run;
export const POST = run;
