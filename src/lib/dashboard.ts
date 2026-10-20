import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, products, supplierSubmissions } from "@/db/schema";
import type { AdminRole } from "@/db/schema";
import { isManager } from "@/lib/rbac";
import { balancesReport } from "@/lib/reports/balances";
import { parseRange } from "@/lib/reports/range";
import { salesReport } from "@/lib/reports/sales";
import { countOpenShifts } from "@/lib/shifts/queries";

const num = (v: unknown) => Number(v ?? 0);

/** KPI bundle for the admin dashboard. Cashiers get operational numbers only. */
export async function dashboardData(role: AdminRole, tz: string) {
  const manager = isManager(role);
  const today = parseRange({ range: "today" }, tz);
  const twoWeeks = parseRange({ range: "custom", from: shiftDays(today.to, -13), to: today.to }, tz);
  const [todaySales, series, [openRow], [stockRow], recent, balances, [approvals], openShifts, [customerRow]] = await Promise.all([
    salesReport(today, tz),
    salesReport(twoWeeks, tz),
    db.select({ n: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`, delivery: sql<number>`count(*) filter (where ${orders.status} = 'out_for_delivery')::int` }).from(orders).where(inArray(orders.status, ["pending", "confirmed", "ready", "out_for_delivery"])),
    db.select({ low: sql<number>`count(*) filter (where ${products.reorderLevel} > 0 and ${products.stockQty} <= ${products.reorderLevel})::int`, out: sql<number>`count(*) filter (where ${products.stockQty} <= 0)::int`, valuation: sql<string>`coalesce(sum(${products.stockQty} * ${products.costPaisa}), 0)` }).from(products).where(eq(products.status, "active")),
    db.select({ id: orders.id, number: orders.number, status: orders.status, channel: orders.channel, customerName: orders.customerName, totalPaisa: orders.totalPaisa, paymentStatus: orders.paymentStatus, createdAt: orders.createdAt }).from(orders).orderBy(desc(orders.createdAt)).limit(8),
    manager ? balancesReport() : Promise.resolve(null),
    manager ? db.select({ n: sql<number>`count(*)::int` }).from(supplierSubmissions).where(eq(supplierSubmissions.status, "pending")) : Promise.resolve([{ n: 0 }]),
    countOpenShifts(),
    db.select({ n: sql<number>`count(*)::int`, withPoints: sql<number>`count(*) filter (where ${customers.pointsBalance} > 0)::int` }).from(customers).where(eq(customers.isActive, true)),
  ]);
  const lowStockList = await db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stockQty: products.stockQty, reorderLevel: products.reorderLevel })
    .from(products)
    .where(and(eq(products.status, "active"), gt(products.reorderLevel, 0), lte(products.stockQty, products.reorderLevel)))
    .orderBy(products.stockQty)
    .limit(6);
  return {
    today: todaySales.kpis,
    series: series.byDay,
    openOrders: { total: openRow?.n ?? 0, pending: openRow?.pending ?? 0, outForDelivery: openRow?.delivery ?? 0 },
    stock: { low: stockRow?.low ?? 0, out: stockRow?.out ?? 0, valuationPaisa: Math.round(num(stockRow?.valuation)) },
    lowStockList,
    recent,
    balances: balances?.kpis ?? null,
    pendingApprovals: approvals?.n ?? 0,
    openShifts,
    customers: { total: customerRow?.n ?? 0, withPoints: customerRow?.withPoints ?? 0 },
  };
}

function shiftDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
