import { audit } from "@/lib/auth/audit";
import { getCurrentSession, getRequestMeta } from "@/lib/auth/session";
import { paisaToDecimalString } from "@/lib/money";
import { isManager } from "@/lib/rbac";
import { csvResponse } from "@/lib/reports/csv";
import { getSettings } from "@/lib/settings";
import { listShifts } from "@/lib/shifts/queries";
import { shiftListParamsSchema } from "@/lib/validation/shifts";

export const dynamic = "force-dynamic";

/** CSV of shifts matching the same filters as /shifts (managers only). */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || !isManager(session.user.role)) return new Response("Not found", { status: 404 });
  const sp = new URL(request.url).searchParams;
  const parsed = shiftListParamsSchema.safeParse(Object.fromEntries(["q", "cashier", "status", "variance", "range", "from", "to"].map((k) => [k, sp.get(k) || undefined])));
  const params = parsed.success ? parsed.data : shiftListParamsSchema.parse({});
  const settings = await getSettings();
  const tz = settings.store.timezone;
  const iso = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : "");
  const money = (p: number | null) => (p == null ? "" : paisaToDecimalString(p));
  const rows: Record<string, unknown>[] = [];
  let range = null as null | { from: string; to: string };
  for (let page = 1; page <= 40; page++) {
    const r = await listShifts({ ...params, page }, tz);
    range = r.range;
    for (const s of r.rows) rows.push({ number: s.number, cashier: s.cashierName, status: s.status, opened_at: iso(s.openedAt), closed_at: iso(s.closedAt), sales: s.sales, sales_total: money(s.salesPaisa), cash: money(s.cashPaisa), card: money(s.cardPaisa), bank_transfer: money(s.bankPaisa), credit: money(s.creditPaisa), opening_float: money(s.openingFloatPaisa), expected_cash: money(s.expectedCashPaisa), counted_cash: money(s.countedCashPaisa), variance: money(s.variancePaisa), reopened: s.reopenedAt ? "yes" : "" });
    if (page >= r.pageCount) break;
  }
  const meta = await getRequestMeta();
  await audit("report.exported", { ...meta, actorUserId: session.user.id, metadata: { report: "shifts", from: range?.from, to: range?.to } });
  return csvResponse(`shifts_${range?.from ?? ""}_${range?.to ?? ""}.csv`, rows);
}
