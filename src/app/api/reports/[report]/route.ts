import { audit } from "@/lib/auth/audit";
import { getCurrentSession, getRequestMeta } from "@/lib/auth/session";
import { exportExpenses } from "@/lib/expenses/queries";
import { paisaToDecimalString } from "@/lib/money";
import { isManager } from "@/lib/rbac";
import { csvResponse } from "@/lib/reports/csv";
import { pnlReport } from "@/lib/reports/pnl";
import { purchaseRows } from "@/lib/reports/purchases";
import { parseRange } from "@/lib/reports/range";
import { salesRows } from "@/lib/reports/sales";
import { stockRows } from "@/lib/reports/stock";
import { getSettings } from "@/lib/settings";
import { storeToday } from "@/lib/stock/batches";
import { expiryStatus } from "@/lib/stock/expiry";
import { EXPIRY_VIEWS, listBatches, type ExpiryView } from "@/lib/stock/expiry-queries";
import { expenseListParamsSchema } from "@/lib/validation/expenses";

export const dynamic = "force-dynamic";

const money = (p: number | null | undefined) => paisaToDecimalString(p ?? 0);
const iso = (d: Date | null | undefined, tz: string) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : "");

/** CSV exports for the report pages; managers only. */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[report]">) {
  const session = await getCurrentSession();
  if (!session || !isManager(session.user.role)) return new Response("Not found", { status: 404 });
  const { report } = await ctx.params;
  const settings = await getSettings();
  const tz = settings.store.timezone;
  const sp = new URL(request.url).searchParams;
  const range = parseRange({ range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, tz);
  const stamp = `${range.from}_${range.to}`;
  let response: Response;
  switch (report) {
    case "sales": {
      const rows = await salesRows(range, tz);
      response = csvResponse(`sales_${stamp}.csv`, rows.map((r) => ({ number: r.number, completed_at: iso(r.completedAt, tz), channel: r.channel, fulfillment: r.fulfillment, customer: r.customer ?? "", subtotal: money(r.subtotalPaisa), discount: money(r.discountPaisa), points_value: money(r.pointsValuePaisa), delivery_fee: money(r.deliveryFeePaisa), tax: money(r.taxPaisa), total: money(r.totalPaisa), payment_status: r.paymentStatus })));
      break;
    }
    case "purchases": {
      const rows = await purchaseRows(range, tz);
      response = csvResponse(`purchases_${stamp}.csv`, rows.map((r) => ({ number: r.number, received_at: iso(r.receivedAt, tz), supplier: r.supplier, invoice_ref: r.invoiceRef ?? "", total: money(r.totalPaisa), paid: money(r.paidPaisa), payment_status: r.paymentStatus })));
      break;
    }
    case "pnl": {
      const r = await pnlReport(range, tz);
      response = csvResponse(`profit_loss_${stamp}.csv`, r.byDay.map((d) => ({ day: d.day, revenue_ex_tax: money(d.revenuePaisa), cost_of_goods: money(d.cogsPaisa), expenses: money(d.expensesPaisa), profit: money(d.profitPaisa) })));
      break;
    }
    case "expenses": {
      const parsed = expenseListParamsSchema.safeParse({ q: sp.get("q") || undefined, category: sp.get("category") || undefined, method: sp.get("method") || undefined, from: sp.get("from") || range.from, to: sp.get("to") || range.to });
      const params = parsed.success ? parsed.data : { from: range.from, to: range.to, page: 1 };
      const rows = await exportExpenses(params);
      response = csvResponse(`expenses_${params.from ?? ""}_${params.to ?? ""}.csv`, rows.map((r) => ({ date: r.incurredAt, category: r.category, description: r.description, amount: money(r.amountPaisa), method: r.method, reference: r.reference ?? "", receipt_url: r.receiptUrl ?? "" })));
      break;
    }
    case "stock": {
      const rows = await stockRows();
      response = csvResponse(`stock_${range.to}.csv`, rows.map((r) => ({ sku: r.sku, name: r.name, barcode: r.barcode ?? "", category: r.category ?? "", supplier: r.supplier ?? "", unit: r.unit, stock_qty: r.stockQty, reorder_level: r.reorderLevel, cost: money(r.costPaisa), price: money(r.pricePaisa), value_at_cost: money(Math.round(r.stockQty * r.costPaisa)) })));
      break;
    }
    case "expiry": {
      // Open batches by default; ?view=expired|soon|missing|all narrows or widens it.
      const today = storeToday(tz);
      const warningDays = settings.stock.expiryWarningDays;
      const viewParam = sp.get("view") ?? "open";
      const view: ExpiryView = (EXPIRY_VIEWS as readonly string[]).includes(viewParam) ? (viewParam as ExpiryView) : "open";
      const { rows } = await listBatches({ view, today, warningDays, pageSize: 20_000 });
      response = csvResponse(
        `expiry_${view}_${today}.csv`,
        rows.map((r) => ({
          sku: r.sku,
          product: r.productName,
          batch: r.batchCode ?? "",
          expiry: r.expiry ?? "",
          status: r.qtyRemaining > 0 ? expiryStatus(r.expiry, today, r.expiryWarningDays ?? warningDays) : "empty",
          supplier: r.supplierName ?? "",
          purchase: r.purchaseNumber ?? "",
          source: r.source,
          unit: r.unit,
          received_qty: r.receivedQty,
          remaining_qty: r.qtyRemaining,
          unit_cost: money(r.unitCostPaisa),
          value_at_cost: money(Math.round(r.qtyRemaining * r.unitCostPaisa)),
        })),
      );
      break;
    }
    default:
      return new Response("Not found", { status: 404 });
  }
  const meta = await getRequestMeta();
  await audit("report.exported", { ...meta, actorUserId: session.user.id, metadata: { report, from: range.from, to: range.to } });
  return response;
}
