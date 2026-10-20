import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { products, suppliers, type EmailTemplate } from "@/db/schema";
import { formatDate, formatQty } from "@/lib/format";
import { loadInvoiceDocument } from "@/lib/invoices/document";
import { formatPKR } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";
import { renderInvoicePdf } from "@/lib/pdf/render";
import { getSettings } from "@/lib/settings";
import type { EmailAttachment } from "./brevo";

export type RenderedEmail = { subject: string; html: string; text: string; attachments: EmailAttachment[] };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(storeName: string, title: string, body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">
<div style="background:#18181b;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold">${esc(storeName)}</div>
<div style="padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${body}</div>
<div style="padding:12px 24px;background:#fafafa;color:#71717a;font-size:12px">${esc(footer)}</div></div></body></html>`;
}

const tableStyle = 'style="width:100%;border-collapse:collapse;font-size:14px"';
const td = (s: string, right = false) => `<td style="padding:6px 4px;border-bottom:1px solid #e4e4e7;${right ? "text-align:right" : ""}">${s}</td>`;

async function orderEmail(orderId: string, kind: "order_confirmation" | "invoice"): Promise<RenderedEmail | null> {
  const [doc, settings] = await Promise.all([loadInvoiceDocument(orderId), getSettings()]);
  if (!doc) return null;
  const { order, store } = doc;
  const tz = settings.store.timezone;
  const rows = order.items.map((i) => `<tr>${td(esc(i.name))}${td(`${formatQty(i.qty)} ${esc(i.unit)}`, true)}${td(formatPKR(i.unitPricePaisa), true)}${td(formatPKR(i.lineTotalPaisa), true)}</tr>`).join("");
  const totals = [
    ["Subtotal", order.subtotalPaisa],
    ...(order.discountPaisa ? [["Discount", -order.discountPaisa] as const] : []),
    ...(order.pointsValuePaisa ? [[`Points (${order.pointsRedeemed})`, -order.pointsValuePaisa] as const] : []),
    ...(order.deliveryFeePaisa ? [["Delivery", order.deliveryFeePaisa] as const] : []),
    ["Total", order.totalPaisa],
    ["Paid", order.paidPaisa],
    ["Balance due", doc.balanceDuePaisa],
  ] as const;
  const totalsHtml = totals.map(([l, v]) => `<tr>${td(`<b>${esc(l)}</b>`, true)}${td(formatPKR(v), true)}</tr>`).join("");
  const intro = kind === "order_confirmation"
    ? `<p>Thank you${order.customerName ? `, ${esc(order.customerName)}` : ""}. We have received your order <b>${esc(order.number)}</b> for ${order.fulfillment === "delivery" ? "delivery" : "pickup"}${order.scheduledFor ? ` on ${esc(formatDate(order.scheduledFor, tz))}` : ""}.</p>`
    : `<p>Please find invoice <b>${esc(doc.invoice?.number ?? order.number)}</b> for order ${esc(order.number)} attached as a PDF.${doc.balanceDuePaisa > 0 && doc.invoice?.dueAt ? ` Payment of ${formatPKR(doc.balanceDuePaisa)} is due by ${esc(formatDate(doc.invoice.dueAt, tz))}.` : ""}</p>`;
  const paymentsHtml = order.payments.length ? `<p style="font-size:13px;color:#52525b">Payments: ${order.payments.map((p) => `${PAYMENT_METHOD_LABELS[p.method]} ${formatPKR(p.amountPaisa)}`).join(", ")}</p>` : "";
  const body = `${intro}<table ${tableStyle}><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Price</th><th align="right">Amount</th></tr>${rows}</table><table ${tableStyle} style="margin-top:8px;width:60%;margin-left:auto">${totalsHtml}</table>${paymentsHtml}${order.deliveryAddress ? `<p style="font-size:13px">Deliver to: ${esc(order.deliveryAddress)}</p>` : ""}`;
  const footer = [store.address, store.phone, store.email].filter(Boolean).join(" · ") || store.name;
  const subject = kind === "order_confirmation" ? `Order ${order.number} received – ${store.name}` : `Invoice ${doc.invoice?.number ?? order.number} from ${store.name}`;
  const text = `${subject}\n\n${order.items.map((i) => `${i.name} × ${formatQty(i.qty)} ${i.unit} = ${formatPKR(i.lineTotalPaisa)}`).join("\n")}\n\nTotal ${formatPKR(order.totalPaisa)} · Paid ${formatPKR(order.paidPaisa)} · Balance due ${formatPKR(doc.balanceDuePaisa)}\n\n${footer}`;
  const attachments: EmailAttachment[] = [];
  if (kind === "invoice") {
    const pdf = await renderInvoicePdf(orderId);
    if (pdf) attachments.push({ name: pdf.filename, contentBase64: pdf.buffer.toString("base64") });
  }
  return { subject, html: layout(store.name, kind === "order_confirmation" ? `Order ${order.number} received` : `Invoice ${doc.invoice?.number ?? order.number}`, body, footer), text, attachments };
}

async function lowStockEmail(productIds: string[], supplierId: string | null): Promise<RenderedEmail | null> {
  const settings = await getSettings();
  const ids = productIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!ids.length) return null;
  const list = await db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stockQty: products.stockQty, reorderLevel: products.reorderLevel, reorderQty: products.reorderQty, supplierName: suppliers.name })
    .from(products)
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(inArray(products.id, ids))
    .orderBy(products.name);
  const storeName = settings.store.name;
  const title = supplierId ? `Restock request from ${storeName}` : `Low stock alert: ${list.length} product${list.length === 1 ? "" : "s"}`;
  const html = `<p>${supplierId ? "The following products you supply are running low. Please arrange a delivery." : "These products are at or below their reorder level."}</p><table ${tableStyle}><tr><th align="left">Product</th><th align="left">SKU</th><th align="right">In stock</th><th align="right">Reorder level</th><th align="right">Suggested qty</th></tr>${list.map((p) => `<tr>${td(esc(p.name))}${td(esc(p.sku))}${td(`${formatQty(p.stockQty)} ${esc(p.unit)}`, true)}${td(formatQty(p.reorderLevel), true)}${td(formatQty(p.reorderQty), true)}</tr>`).join("")}</table>${supplierId ? "" : `<p style="font-size:12px;color:#71717a">Suppliers: ${esc([...new Set(list.map((p) => p.supplierName).filter(Boolean))].join(", ") || "none assigned")}</p>`}`;
  const text = `${title}\n\n${list.map((p) => `${p.name} (${p.sku}): ${formatQty(p.stockQty)} ${p.unit} in stock, reorder at ${formatQty(p.reorderLevel)}, suggested ${formatQty(p.reorderQty)}`).join("\n")}`;
  return { subject: title, html: layout(storeName, title, html, settings.store.address || storeName), text, attachments: [] };
}

export async function renderEmail(template: EmailTemplate, payload: Record<string, unknown>): Promise<RenderedEmail | null> {
  switch (template) {
    case "order_confirmation":
      return typeof payload.orderId === "string" ? orderEmail(payload.orderId, "order_confirmation") : null;
    case "invoice":
      return typeof payload.orderId === "string" ? orderEmail(payload.orderId, "invoice") : null;
    case "low_stock":
      return lowStockEmail(Array.isArray(payload.productIds) ? (payload.productIds as string[]) : [], null);
    case "supplier_low_stock":
      return lowStockEmail(Array.isArray(payload.productIds) ? (payload.productIds as string[]) : [], typeof payload.supplierId === "string" ? payload.supplierId : null);
    case "test_email": {
      const settings = await getSettings();
      const title = `Test email from ${settings.store.name}`;
      return { subject: title, html: layout(settings.store.name, title, "<p>If you can read this, Brevo is configured correctly.</p>", settings.store.address || settings.store.name), text: `${title}\n\nIf you can read this, Brevo is configured correctly.`, attachments: [] };
    }
    default:
      return null;
  }
}
