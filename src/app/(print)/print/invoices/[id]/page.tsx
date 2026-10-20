import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { PrintOnLoad } from "@/components/print-on-load";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { loadInvoiceDocument } from "@/lib/invoices/document";
import { formatPKR } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireRole(ROLE_GROUPS.staff);
  const { id } = await params;
  const raw = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const doc = await loadInvoiceDocument(id);
  if (!doc) notFound();
  const { order, store } = doc;
  const settings = await getSettings();
  const tz = settings.store.timezone;
  const title = doc.invoice ? `Invoice ${doc.invoice.number}` : `Order ${order.number}`;

  return (
    <div className="mx-auto max-w-[190mm] p-8 text-[13px] leading-snug print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } }`}</style>
      {firstParam(raw.print) === "1" ? <PrintOnLoad /> : null}
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <header className="flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{store.name}</h1>
          {store.address ? <p className="whitespace-pre-line">{store.address}</p> : null}
          <p>{[store.phone, store.email].filter(Boolean).join(" · ")}</p>
          {store.taxId ? <p>Tax ID: {store.taxId}</p> : null}
        </div>
        <div className="text-right">
          <h2 className="text-xl font-semibold">{title}</h2>
          {doc.invoice ? <p>Issued {formatDate(doc.invoice.issuedAt, tz)}</p> : null}
          {doc.invoice?.dueAt && doc.invoice.status === "issued" ? <p>Due {formatDate(doc.invoice.dueAt, tz)}</p> : null}
          <p>Order {order.number} · {formatDate(order.createdAt, tz)}</p>
          {doc.invoice?.status === "void" ? <p className="mt-1 inline-block border-2 border-red-600 px-2 font-bold text-red-600">VOID</p> : null}
          {doc.invoice?.status === "paid" ? <p className="mt-1 inline-block border-2 border-green-700 px-2 font-bold text-green-700">PAID</p> : null}
        </div>
      </header>
      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold uppercase text-neutral-500">Bill to</h3>
          <p className="font-medium">{order.customerName ?? "Walk-in customer"}</p>
          {order.customerPhone ? <p>{order.customerPhone}</p> : null}
          {order.customerEmail ? <p>{order.customerEmail}</p> : null}
          {order.deliveryAddress ? <p className="whitespace-pre-line">{order.deliveryAddress}</p> : null}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase text-neutral-500">Fulfilment</h3>
          <p className="capitalize">{order.fulfillment}{order.scheduledFor ? ` · ${formatDate(order.scheduledFor, tz)}` : ""}</p>
          <p className="capitalize">Status: {order.status.replace("_", " ")}</p>
        </div>
      </section>
      <table className="mt-6 w-full border-collapse">
        <thead><tr className="border-b-2 border-black text-left"><th className="py-1">#</th><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit price</th><th className="py-1 text-right">Discount</th><th className="py-1 text-right">Amount</th></tr></thead>
        <tbody>
          {order.items.map((i, idx) => (
            <tr key={i.id} className="border-b border-neutral-300">
              <td className="py-1 pr-2">{idx + 1}</td>
              <td className="py-1 pr-2">{i.name}{i.sku ? <span className="text-neutral-500"> · {i.sku}</span> : null}</td>
              <td className="py-1 text-right">{i.qty} {i.unit}</td>
              <td className="py-1 text-right tabular-nums">{formatPKR(i.unitPricePaisa, { symbol: false })}</td>
              <td className="py-1 text-right tabular-nums">{i.discountPaisa ? formatPKR(i.discountPaisa, { symbol: false }) : "—"}</td>
              <td className="py-1 text-right tabular-nums">{formatPKR(i.lineTotalPaisa, { symbol: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="mt-4 flex justify-end">
        <table className="w-72 text-right">
          <tbody>
            <tr><td className="py-0.5 text-neutral-600">Subtotal</td><td className="tabular-nums">{formatPKR(order.subtotalPaisa)}</td></tr>
            {order.discountPaisa ? <tr><td className="py-0.5 text-neutral-600">Discount{order.discountCode ? ` (${order.discountCode})` : ""}</td><td className="tabular-nums">−{formatPKR(order.discountPaisa)}</td></tr> : null}
            {order.pointsValuePaisa ? <tr><td className="py-0.5 text-neutral-600">Loyalty points ({order.pointsRedeemed})</td><td className="tabular-nums">−{formatPKR(order.pointsValuePaisa)}</td></tr> : null}
            {order.deliveryFeePaisa ? <tr><td className="py-0.5 text-neutral-600">Delivery</td><td className="tabular-nums">{formatPKR(order.deliveryFeePaisa)}</td></tr> : null}
            <tr className="border-t-2 border-black text-base font-bold"><td className="py-1">Total</td><td className="tabular-nums">{formatPKR(order.totalPaisa)}</td></tr>
            <tr><td className="py-0.5 text-neutral-600">Includes tax</td><td className="tabular-nums">{formatPKR(order.taxPaisa)}</td></tr>
            <tr><td className="py-0.5 text-neutral-600">Paid</td><td className="tabular-nums">{formatPKR(order.paidPaisa)}</td></tr>
            <tr className="font-semibold"><td className="py-0.5">Balance due</td><td className="tabular-nums">{formatPKR(doc.balanceDuePaisa)}</td></tr>
          </tbody>
        </table>
      </section>
      {order.payments.length ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase text-neutral-500">Payments</h3>
          <ul>{order.payments.map((p) => <li key={p.id}>{formatDate(p.createdAt, tz)} · {PAYMENT_METHOD_LABELS[p.method]}{p.reference ? ` (${p.reference})` : ""}: {formatPKR(p.amountPaisa)}</li>)}</ul>
        </section>
      ) : null}
      {doc.terms ? <footer className="mt-8 whitespace-pre-line border-t pt-3 text-xs text-neutral-600">{doc.terms}</footer> : null}
    </div>
  );
}
