import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintOnLoad } from "@/components/print-on-load";
import { requireRole } from "@/lib/auth/session";
import { formatLocalDateTime, formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { getOrder } from "@/lib/orders/queries";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Receipt" };

// 80 mm thermal receipt: 72 mm printable width, monospace, no margins.
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<SearchParams> }) {
  await requireRole(ROLE_GROUPS.staff);
  const { orderId } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const [order, settings] = await Promise.all([getOrder(orderId), getSettings()]);
  if (!order) notFound();
  const tz = settings.store.timezone;
  const money = (p: number) => formatPKR(p, { symbol: false });
  const cashier = order.events.find((e) => e.fromStatus === null)?.actor?.name;

  return (
    <div className="mx-auto w-[72mm] bg-white px-1 py-2 font-mono text-[11px] leading-tight text-black">
      <style>{`@page { size: 80mm auto; margin: 0; } @media print { html, body { width: 80mm; } } .dash { border-top: 1px dashed #000; margin: 4px 0; }`}</style>
      {firstParam(raw.print) === "1" ? <PrintOnLoad delayMs={200} /> : null}
      <div className="text-center">
        <div className="text-[14px] font-bold">{settings.store.name}</div>
        {settings.store.address ? <div className="whitespace-pre-line">{settings.store.address}</div> : null}
        {settings.store.phone ? <div>Tel: {settings.store.phone}</div> : null}
        {settings.store.taxId ? <div>Tax ID: {settings.store.taxId}</div> : null}
        {settings.receipt.header ? <div className="mt-1 whitespace-pre-line">{settings.receipt.header}</div> : null}
      </div>
      <div className="dash" />
      <div className="flex justify-between"><span>Receipt</span><span>{order.invoice?.number ?? order.number}</span></div>
      <div className="flex justify-between"><span>Order</span><span>{order.number}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{formatLocalDateTime(order.createdAt, tz)}</span></div>
      {cashier ? <div className="flex justify-between"><span>Cashier</span><span>{cashier}</span></div> : null}
      {order.customerName ? <div className="flex justify-between"><span>{order.customerId ? "Customer" : "Guest"}</span><span className="truncate pl-2">{order.customerName}</span></div> : null}
      {order.customerPhone ? <div className="flex justify-between"><span>Phone</span><span>{order.customerPhone}</span></div> : null}
      <div className="dash" />
      {order.items.map((i) => (
        <div key={i.id} className="mb-1">
          <div>{i.name}</div>
          <div className="flex justify-between">
            <span>{formatQty(i.qty)} {i.unit} x {money(i.unitPricePaisa)}{i.discountPaisa ? ` -${money(i.discountPaisa)}` : ""}</span>
            <span>{money(i.lineTotalPaisa)}</span>
          </div>
        </div>
      ))}
      <div className="dash" />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotalPaisa)}</span></div>
      {order.discountPaisa ? <div className="flex justify-between"><span>Discount{order.discountCode ? ` ${order.discountCode}` : ""}</span><span>-{money(order.discountPaisa)}</span></div> : null}
      {order.pointsValuePaisa ? <div className="flex justify-between"><span>Points ({order.pointsRedeemed})</span><span>-{money(order.pointsValuePaisa)}</span></div> : null}
      <div className="flex justify-between text-[14px] font-bold"><span>TOTAL {settings.currency.code}</span><span>{money(order.totalPaisa)}</span></div>
      {order.taxPaisa ? <div className="flex justify-between"><span>Incl. tax</span><span>{money(order.taxPaisa)}</span></div> : null}
      <div className="dash" />
      {order.payments.map((p) => (
        <div key={p.id}>
          <div className="flex justify-between"><span>{PAYMENT_METHOD_LABELS[p.method]}{p.reference ? ` ${p.reference}` : ""}</span><span>{money(p.amountPaisa)}</span></div>
          {p.changePaisa ? <div className="flex justify-between"><span>Cash received / change</span><span>{money(p.receivedPaisa ?? 0)} / {money(p.changePaisa)}</span></div> : null}
        </div>
      ))}
      {order.customer ? (
        <>
          <div className="dash" />
          {order.pointsEarned ? <div className="flex justify-between"><span>Points earned</span><span>{order.pointsEarned}</span></div> : null}
          <div className="flex justify-between"><span>Points balance</span><span>{order.customer.pointsBalance}</span></div>
        </>
      ) : null}
      <div className="dash" />
      <div className="mt-1 text-center whitespace-pre-line">{settings.receipt.footer}</div>
    </div>
  );
}
