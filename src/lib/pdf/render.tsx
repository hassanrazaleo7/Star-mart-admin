import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadInvoiceDocument } from "@/lib/invoices/document";
import { getSettings } from "@/lib/settings";
import { InvoicePdf } from "./invoice";

/** Renders an order's invoice as a PDF buffer (null when the order does not exist). */
export async function renderInvoicePdf(orderId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const [doc, settings] = await Promise.all([loadInvoiceDocument(orderId), getSettings()]);
  if (!doc) return null;
  const buffer = await renderToBuffer(<InvoicePdf doc={doc} timeZone={settings.store.timezone} />);
  const filename = `${doc.invoice ? doc.invoice.number : doc.order.number}.pdf`;
  return { buffer: Buffer.from(buffer), filename };
}
