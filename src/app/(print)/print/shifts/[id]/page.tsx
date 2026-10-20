import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { PrintOnLoad } from "@/components/print-on-load";
import { requireRole } from "@/lib/auth/session";
import { formatLocalDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { getShift, shiftSummary } from "@/lib/shifts/queries";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Shift closing" };

export default async function ShiftPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const { id } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const shift = await getShift(id);
  if (!shift || (!isManager(user.role) && shift.cashierUserId !== user.id)) notFound();
  const [summary, settings] = await Promise.all([shiftSummary(shift.id, shift.openingFloatPaisa), getSettings()]);
  const tz = settings.store.timezone;
  const expected = shift.expectedCashPaisa ?? summary.expectedCashPaisa;
  const row = (label: string, value: string, bold = false) => <tr key={label} className={bold ? "font-bold" : ""}><td className="py-0.5">{label}</td><td className="py-0.5 text-right tabular-nums">{value}</td></tr>;
  return (
    <div className="mx-auto max-w-[190mm] p-8 text-[13px] leading-snug print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } }`}</style>
      {firstParam(raw.print) === "1" ? <PrintOnLoad /> : null}
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold">{settings.store.name} · Shift closing {shift.number}</h1>
        <p>Cashier {shift.cashier.name} · opened {formatLocalDateTime(shift.openedAt, tz)}{shift.closedAt ? ` · closed ${formatLocalDateTime(shift.closedAt, tz)}` : " · still open"}</p>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-8">
        <table className="w-full"><tbody>
          {row("Sales", `${summary.salesCount} (${formatQty(summary.itemsSold)} items)`)}
          {row("Gross sales", formatPKR(summary.grossPaisa))}
          {row("Discounts", formatPKR(summary.discountPaisa))}
          {row("Points redeemed", formatPKR(summary.pointsValuePaisa))}
          {row("Tax included", formatPKR(summary.taxPaisa))}
          {row("Cancelled sales", String(summary.cancelledCount))}
        </tbody></table>
        <table className="w-full"><tbody>
          {(["cash", "card", "bank_transfer", "credit"] as const).map((m) => row(PAYMENT_METHOD_LABELS[m], `${formatPKR(summary.byMethod[m].receivedPaisa)}${summary.byMethod[m].refundedPaisa ? ` (−${formatPKR(summary.byMethod[m].refundedPaisa)})` : ""}`))}
          {row("Opening float", formatPKR(shift.openingFloatPaisa))}
          {row("Expected cash", formatPKR(expected), true)}
          {row("Counted cash", shift.countedCashPaisa != null ? formatPKR(shift.countedCashPaisa) : "—", true)}
          {row("Variance", shift.variancePaisa == null ? "—" : shift.variancePaisa === 0 ? "0.00 (balanced)" : `${shift.variancePaisa < 0 ? "−" : "+"}${formatPKR(Math.abs(shift.variancePaisa))}`, true)}
        </tbody></table>
      </div>
      {shift.notes ? <p className="mt-4 text-xs">Notes: {shift.notes}</p> : null}
      <div className="mt-8 grid grid-cols-2 gap-8 text-xs"><div className="border-t pt-2">Cashier signature</div><div className="border-t pt-2">Manager signature</div></div>
    </div>
  );
}
