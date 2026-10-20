import { desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, loyaltyTransactions } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { rangeWhere, type DateRange } from "./range";

const num = (v: unknown) => Number(v ?? 0);

export async function loyaltyReport(range: DateRange, tz: string) {
  const settings = await getSettings();
  const where = rangeWhere(loyaltyTransactions.createdAt, range, tz);
  const [[flow], [liability], topCustomers] = await Promise.all([
    db.select({ earned: sql<string>`coalesce(sum(points_delta) filter (where kind = 'earn'), 0)`, redeemed: sql<string>`coalesce(-sum(points_delta) filter (where kind = 'redeem'), 0)`, adjusted: sql<string>`coalesce(sum(points_delta) filter (where kind = 'adjust'), 0)`, reversed: sql<string>`coalesce(sum(points_delta) filter (where kind = 'reverse'), 0)`, n: sql<number>`count(*)::int` }).from(loyaltyTransactions).where(where),
    db.select({ points: sql<string>`coalesce(sum(${customers.pointsBalance}), 0)`, members: sql<number>`count(*) filter (where ${customers.pointsBalance} > 0)::int` }).from(customers).where(eq(customers.isActive, true)),
    db.select({ id: customers.id, name: customers.name, phone: customers.phone, pointsBalance: customers.pointsBalance }).from(customers).where(gt(customers.pointsBalance, 0)).orderBy(desc(customers.pointsBalance)).limit(10),
  ]);
  const outstandingPoints = num(liability?.points);
  return {
    kpis: { earned: num(flow?.earned), redeemed: num(flow?.redeemed), adjusted: num(flow?.adjusted), reversed: num(flow?.reversed), transactions: flow?.n ?? 0, outstandingPoints, liabilityPaisa: outstandingPoints * settings.loyalty.redeemValuePaisa, members: liability?.members ?? 0, redeemValuePaisa: settings.loyalty.redeemValuePaisa },
    topCustomers,
  };
}
