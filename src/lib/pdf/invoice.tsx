import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/lib/format";
import type { InvoiceDocument } from "@/lib/invoices/document";
import { formatPKR } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/types";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  label: { fontSize: 8, color: "#777", textTransform: "uppercase", marginBottom: 2 },
  table: { marginTop: 16, borderTopWidth: 1.5, borderColor: "#000" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#999", paddingVertical: 4 },
  th: { fontFamily: "Helvetica-Bold" },
  cNo: { width: "5%" },
  cItem: { width: "43%" },
  cQty: { width: "12%", textAlign: "right" },
  cPrice: { width: "14%", textAlign: "right" },
  cDisc: { width: "12%", textAlign: "right" },
  cAmt: { width: "14%", textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { borderTopWidth: 1.5, borderColor: "#000", marginTop: 4, paddingTop: 4, fontFamily: "Helvetica-Bold", fontSize: 12 },
  stamp: { marginTop: 6, alignSelf: "flex-end", borderWidth: 2, paddingHorizontal: 6, paddingVertical: 2, fontFamily: "Helvetica-Bold" },
  footer: { marginTop: 24, borderTopWidth: 0.5, borderColor: "#999", paddingTop: 8, fontSize: 8, color: "#555" },
});

export function InvoicePdf({ doc, timeZone }: { doc: InvoiceDocument; timeZone: string }) {
  const { order, store, invoice } = doc;
  const money = (p: number) => formatPKR(p, { symbol: doc.currency.symbol });
  return (
    <Document title={invoice ? `Invoice ${invoice.number}` : `Order ${order.number}`} author={store.name}>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View>
            <Text style={s.h1}>{store.name}</Text>
            {store.address ? <Text style={s.muted}>{store.address}</Text> : null}
            <Text style={s.muted}>{[store.phone, store.email].filter(Boolean).join("  ·  ")}</Text>
            {store.taxId ? <Text style={s.muted}>Tax ID: {store.taxId}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h2}>{invoice ? `Invoice ${invoice.number}` : `Order ${order.number}`}</Text>
            {invoice ? <Text>Issued {formatDate(invoice.issuedAt, timeZone)}</Text> : null}
            {invoice?.dueAt && invoice.status === "issued" ? <Text>Due {formatDate(invoice.dueAt, timeZone)}</Text> : null}
            <Text>Order {order.number} · {formatDate(order.createdAt, timeZone)}</Text>
            {invoice?.status === "void" ? <Text style={[s.stamp, { color: "#b91c1c", borderColor: "#b91c1c" }]}>VOID</Text> : null}
            {invoice?.status === "paid" ? <Text style={[s.stamp, { color: "#15803d", borderColor: "#15803d" }]}>PAID</Text> : null}
          </View>
        </View>
        <View style={[s.row, { marginTop: 18 }]}>
          <View style={{ width: "50%" }}>
            <Text style={s.label}>Bill to</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{order.customerName ?? "Walk-in customer"}</Text>
            {order.customerPhone ? <Text>{order.customerPhone}</Text> : null}
            {order.customerEmail ? <Text>{order.customerEmail}</Text> : null}
            {order.deliveryAddress ? <Text>{order.deliveryAddress}</Text> : null}
          </View>
          <View style={{ width: "40%" }}>
            <Text style={s.label}>Fulfilment</Text>
            <Text>{order.fulfillment === "delivery" ? "Delivery" : "Pickup"}{order.scheduledFor ? ` · ${formatDate(order.scheduledFor, timeZone)}` : ""}</Text>
            <Text>Status: {order.status.replace("_", " ")}</Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={[s.tr, s.th]}>
            <Text style={s.cNo}>#</Text><Text style={s.cItem}>Item</Text><Text style={s.cQty}>Qty</Text><Text style={s.cPrice}>Unit price</Text><Text style={s.cDisc}>Discount</Text><Text style={s.cAmt}>Amount</Text>
          </View>
          {order.items.map((i, idx) => (
            <View key={i.id} style={s.tr}>
              <Text style={s.cNo}>{idx + 1}</Text>
              <Text style={s.cItem}>{i.name}{i.sku ? `  (${i.sku})` : ""}</Text>
              <Text style={s.cQty}>{i.qty} {i.unit}</Text>
              <Text style={s.cPrice}>{formatPKR(i.unitPricePaisa, { symbol: false })}</Text>
              <Text style={s.cDisc}>{i.discountPaisa ? formatPKR(i.discountPaisa, { symbol: false }) : "-"}</Text>
              <Text style={s.cAmt}>{formatPKR(i.lineTotalPaisa, { symbol: false })}</Text>
            </View>
          ))}
        </View>
        <View style={s.totals}>
          <View style={s.totalRow}><Text style={s.muted}>Subtotal</Text><Text>{money(order.subtotalPaisa)}</Text></View>
          {order.discountPaisa ? <View style={s.totalRow}><Text style={s.muted}>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</Text><Text>-{money(order.discountPaisa)}</Text></View> : null}
          {order.pointsValuePaisa ? <View style={s.totalRow}><Text style={s.muted}>Loyalty points ({order.pointsRedeemed})</Text><Text>-{money(order.pointsValuePaisa)}</Text></View> : null}
          {order.deliveryFeePaisa ? <View style={s.totalRow}><Text style={s.muted}>Delivery</Text><Text>{money(order.deliveryFeePaisa)}</Text></View> : null}
          <View style={[s.totalRow, s.grand]}><Text>Total</Text><Text>{money(order.totalPaisa)}</Text></View>
          <View style={s.totalRow}><Text style={s.muted}>Includes tax</Text><Text>{money(order.taxPaisa)}</Text></View>
          <View style={s.totalRow}><Text style={s.muted}>Paid</Text><Text>{money(order.paidPaisa)}</Text></View>
          <View style={[s.totalRow, { fontFamily: "Helvetica-Bold" }]}><Text>Balance due</Text><Text>{money(doc.balanceDuePaisa)}</Text></View>
        </View>
        {order.payments.length ? (
          <View style={{ marginTop: 14 }}>
            <Text style={s.label}>Payments</Text>
            {order.payments.map((p) => <Text key={p.id}>{formatDate(p.createdAt, timeZone)} · {PAYMENT_METHOD_LABELS[p.method]}{p.reference ? ` (${p.reference})` : ""}: {money(p.amountPaisa)}</Text>)}
          </View>
        ) : null}
        {doc.terms ? <Text style={s.footer}>{doc.terms}</Text> : null}
      </Page>
    </Document>
  );
}
