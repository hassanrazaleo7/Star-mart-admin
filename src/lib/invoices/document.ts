import { getOrder } from "@/lib/orders/queries";
import { getSettings, type Settings } from "@/lib/settings";

export type InvoiceDocument = {
  store: Settings["store"];
  currency: Settings["currency"];
  terms: string;
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>;
  invoice: { number: string; status: "issued" | "paid" | "void"; issuedAt: Date; dueAt: Date | null; paidAt: Date | null } | null;
  balanceDuePaisa: number;
};

/** Everything the HTML print page and the PDF need for an order's invoice. */
export async function loadInvoiceDocument(orderId: string): Promise<InvoiceDocument | null> {
  const [order, settings] = await Promise.all([getOrder(orderId), getSettings()]);
  if (!order) return null;
  return {
    store: settings.store,
    currency: settings.currency,
    terms: settings.invoice.terms,
    order,
    invoice: order.invoice ? { number: order.invoice.number, status: order.invoice.status, issuedAt: order.invoice.issuedAt, dueAt: order.invoice.dueAt, paidAt: order.invoice.paidAt } : null,
    balanceDuePaisa: Math.max(0, order.totalPaisa - order.paidPaisa),
  };
}
