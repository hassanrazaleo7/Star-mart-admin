import { desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, purchaseReturns, purchases, supplierPayments, suppliers } from "@/db/schema";

const num = (v: unknown) => Number(v ?? 0);

/** Money owed to the store (customer credit) and by the store (supplier payables). */
export async function balancesReport() {
  const payableExpr = sql<string>`(coalesce((select sum(total_paisa) from ${purchases} pu where pu.supplier_id = ${suppliers}.id and pu.status = 'received'), 0)
    - coalesce((select sum(amount_paisa) from ${supplierPayments} sp where sp.supplier_id = ${suppliers}.id), 0)
    - coalesce((select sum(amount_paisa) from ${purchaseReturns} pr where pr.supplier_id = ${suppliers}.id), 0))`;
  const [[credit], creditCustomers, supplierRows] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${customers.creditBalancePaisa}), 0)`, n: sql<number>`count(*) filter (where ${customers.creditBalancePaisa} > 0)::int` }).from(customers),
    db.select({ id: customers.id, name: customers.name, phone: customers.phone, creditBalancePaisa: customers.creditBalancePaisa, creditLimitPaisa: customers.creditLimitPaisa }).from(customers).where(gt(customers.creditBalancePaisa, 0)).orderBy(desc(customers.creditBalancePaisa)).limit(50),
    db.select({ id: suppliers.id, name: suppliers.name, balancePaisa: payableExpr }).from(suppliers).where(eq(suppliers.isActive, true)).orderBy(desc(payableExpr)).limit(100),
  ]);
  const supplierBalances = supplierRows.map((r) => ({ ...r, balancePaisa: num(r.balancePaisa) })).filter((r) => r.balancePaisa !== 0);
  return {
    kpis: { customerCreditPaisa: num(credit?.total), customersOwing: credit?.n ?? 0, supplierPayablesPaisa: supplierBalances.filter((r) => r.balancePaisa > 0).reduce((s, r) => s + r.balancePaisa, 0), supplierOverpaidPaisa: -supplierBalances.filter((r) => r.balancePaisa < 0).reduce((s, r) => s + r.balancePaisa, 0) },
    creditCustomers,
    supplierBalances,
  };
}
