import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, products, purchaseItems, purchaseReturns, purchases, supplierPayments, supplierSubmissions, suppliers } from "@/db/schema";

export const PAGE_SIZE = 25;

export async function countPendingApprovals(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(supplierSubmissions).where(eq(supplierSubmissions.status, "pending"));
  return Number(row?.n ?? 0);
}

export async function listSuppliers(params: { q?: string; active?: "all" | "active" | "inactive"; page?: number }) {
  const filters: SQL[] = [];
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(suppliers.name, like), ilike(suppliers.contactName, like), ilike(suppliers.phone, like), ilike(suppliers.email, like))!);
  }
  if (params.active === "active") filters.push(eq(suppliers.isActive, true));
  if (params.active === "inactive") filters.push(eq(suppliers.isActive, false));
  const where = filters.length ? and(...filters) : undefined;
  const page = params.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        contactName: suppliers.contactName,
        phone: suppliers.phone,
        email: suppliers.email,
        isActive: suppliers.isActive,
        productCount: sql<number>`(select count(*)::int from ${products} p where p.supplier_id = ${suppliers}.id)`,
        balancePaisa: sql<number>`(coalesce((select sum(total_paisa) from ${purchases} pu where pu.supplier_id = ${suppliers}.id and pu.status = 'received'), 0)
          - coalesce((select sum(amount_paisa) from ${supplierPayments} sp where sp.supplier_id = ${suppliers}.id), 0)
          - coalesce((select sum(amount_paisa) from ${purchaseReturns} pr where pr.supplier_id = ${suppliers}.id), 0))::bigint`,
      })
      .from(suppliers)
      .where(where)
      .orderBy(asc(suppliers.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(suppliers).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r, balancePaisa: Number(r.balancePaisa) })), total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}

export async function getSupplier(id: string) {
  return db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
}

export type SupplierBalance = { purchasedPaisa: number; paidPaisa: number; returnedPaisa: number; balancePaisa: number; status: "settled" | "owed" | "overpaid" };

export async function supplierBalance(supplierId: string): Promise<SupplierBalance> {
  const [row] = await db
    .select({
      purchased: sql<string>`coalesce((select sum(total_paisa) from ${purchases} where supplier_id = ${supplierId} and status = 'received'), 0)`,
      paid: sql<string>`coalesce((select sum(amount_paisa) from ${supplierPayments} where supplier_id = ${supplierId}), 0)`,
      returned: sql<string>`coalesce((select sum(amount_paisa) from ${purchaseReturns} where supplier_id = ${supplierId}), 0)`,
    })
    .from(sql`(select 1) as one`);
  const purchasedPaisa = Number(row?.purchased ?? 0);
  const paidPaisa = Number(row?.paid ?? 0);
  const returnedPaisa = Number(row?.returned ?? 0);
  const balancePaisa = purchasedPaisa - paidPaisa - returnedPaisa;
  return { purchasedPaisa, paidPaisa, returnedPaisa, balancePaisa, status: balancePaisa === 0 ? "settled" : balancePaisa > 0 ? "owed" : "overpaid" };
}

export type StatementRow = { date: Date; kind: "purchase" | "payment" | "return"; ref: string; refId: string | null; debitPaisa: number; creditPaisa: number; balancePaisa: number; note: string | null };

/** Chronological ledger with running balance (what the store owes the supplier). */
export async function supplierStatement(supplierId: string): Promise<StatementRow[]> {
  const [purchaseRows, paymentRows, returnRows] = await Promise.all([
    db.select({ id: purchases.id, date: purchases.receivedAt, number: purchases.number, amount: purchases.totalPaisa, note: purchases.invoiceRef }).from(purchases).where(and(eq(purchases.supplierId, supplierId), eq(purchases.status, "received"))),
    db.select({ id: supplierPayments.id, date: supplierPayments.paidAt, amount: supplierPayments.amountPaisa, method: supplierPayments.method, reference: supplierPayments.reference }).from(supplierPayments).where(eq(supplierPayments.supplierId, supplierId)),
    db.select({ id: purchaseReturns.id, date: purchaseReturns.createdAt, amount: purchaseReturns.amountPaisa, reason: purchaseReturns.reason, productName: products.name }).from(purchaseReturns).innerJoin(products, eq(products.id, purchaseReturns.productId)).where(eq(purchaseReturns.supplierId, supplierId)),
  ]);
  const rows: Omit<StatementRow, "balancePaisa">[] = [
    ...purchaseRows.map((p) => ({ date: p.date ?? new Date(0), kind: "purchase" as const, ref: p.number, refId: p.id, debitPaisa: p.amount, creditPaisa: 0, note: p.note })),
    ...paymentRows.map((p) => ({ date: p.date, kind: "payment" as const, ref: `${p.method}${p.reference ? ` · ${p.reference}` : ""}`, refId: null, debitPaisa: 0, creditPaisa: p.amount, note: null })),
    ...returnRows.map((r) => ({ date: r.date, kind: "return" as const, ref: `Return · ${r.productName}`, refId: null, debitPaisa: 0, creditPaisa: r.amount, note: r.reason })),
  ];
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = 0;
  return rows.map((r) => {
    balance += r.debitPaisa - r.creditPaisa;
    return { ...r, balancePaisa: balance };
  });
}

export async function listPurchases(params: { status?: string; supplier?: string; payment?: string; page?: number; q?: string }) {
  const filters: SQL[] = [];
  if (params.status && ["draft", "received", "cancelled"].includes(params.status)) filters.push(eq(purchases.status, params.status as "draft"));
  if (params.payment && ["unpaid", "partial", "paid"].includes(params.payment)) filters.push(eq(purchases.paymentStatus, params.payment as "unpaid"));
  if (params.supplier) filters.push(eq(purchases.supplierId, params.supplier));
  if (params.q) filters.push(or(ilike(purchases.number, `%${params.q}%`), ilike(purchases.invoiceRef, `%${params.q}%`))!);
  const where = filters.length ? and(...filters) : undefined;
  const page = params.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: purchases.id,
        number: purchases.number,
        status: purchases.status,
        invoiceRef: purchases.invoiceRef,
        receivedAt: purchases.receivedAt,
        createdAt: purchases.createdAt,
        totalPaisa: purchases.totalPaisa,
        paidPaisa: purchases.paidPaisa,
        paymentStatus: purchases.paymentStatus,
        supplierId: purchases.supplierId,
        supplierName: suppliers.name,
        itemCount: sql<number>`(select count(*)::int from ${purchaseItems} pi where pi.purchase_id = ${purchases}.id)`,
      })
      .from(purchases)
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(where)
      .orderBy(desc(purchases.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(purchases).where(where),
  ]);
  return { rows, total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}

export async function getPurchase(id: string) {
  const purchase = await db.query.purchases.findFirst({
    where: eq(purchases.id, id),
    with: { supplier: true, items: { with: { product: true } }, payments: true },
  });
  return purchase ?? null;
}

export async function listSupplierPayments(supplierId: string) {
  return db
    .select({ id: supplierPayments.id, paidAt: supplierPayments.paidAt, amountPaisa: supplierPayments.amountPaisa, method: supplierPayments.method, reference: supplierPayments.reference, note: supplierPayments.note, purchaseNumber: purchases.number, purchaseId: supplierPayments.purchaseId })
    .from(supplierPayments)
    .leftJoin(purchases, eq(purchases.id, supplierPayments.purchaseId))
    .where(eq(supplierPayments.supplierId, supplierId))
    .orderBy(desc(supplierPayments.paidAt));
}

export async function listSupplierReturns(supplierId: string) {
  return db
    .select({ id: purchaseReturns.id, createdAt: purchaseReturns.createdAt, qty: purchaseReturns.qty, amountPaisa: purchaseReturns.amountPaisa, reason: purchaseReturns.reason, productName: products.name, unit: products.unit, purchaseNumber: purchases.number })
    .from(purchaseReturns)
    .innerJoin(products, eq(products.id, purchaseReturns.productId))
    .leftJoin(purchases, eq(purchases.id, purchaseReturns.purchaseId))
    .where(eq(purchaseReturns.supplierId, supplierId))
    .orderBy(desc(purchaseReturns.createdAt));
}

export async function listSupplierProducts(supplierId: string) {
  return db
    .select({ id: products.id, name: products.name, sku: products.sku, barcode: products.barcode, unit: products.unit, stockQty: products.stockQty, reorderLevel: products.reorderLevel, costPaisa: products.costPaisa, pricePaisa: products.pricePaisa, status: products.status })
    .from(products)
    .where(eq(products.supplierId, supplierId))
    .orderBy(asc(products.name));
}

export async function listSubmissions(params: { status?: string; supplier?: string; kind?: string; page?: number }) {
  const filters: SQL[] = [];
  if (params.status && ["pending", "approved", "rejected"].includes(params.status)) filters.push(eq(supplierSubmissions.status, params.status as "pending"));
  if (params.kind && ["product", "supply"].includes(params.kind)) filters.push(eq(supplierSubmissions.kind, params.kind as "product"));
  if (params.supplier) filters.push(eq(supplierSubmissions.supplierId, params.supplier));
  const where = filters.length ? and(...filters) : undefined;
  const page = params.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: supplierSubmissions.id,
        number: supplierSubmissions.number,
        kind: supplierSubmissions.kind,
        status: supplierSubmissions.status,
        payload: supplierSubmissions.payload,
        createdAt: supplierSubmissions.createdAt,
        reviewedAt: supplierSubmissions.reviewedAt,
        reviewNote: supplierSubmissions.reviewNote,
        supplierId: supplierSubmissions.supplierId,
        supplierName: suppliers.name,
        submitterName: adminUsers.name,
      })
      .from(supplierSubmissions)
      .innerJoin(suppliers, eq(suppliers.id, supplierSubmissions.supplierId))
      .leftJoin(adminUsers, eq(adminUsers.id, supplierSubmissions.submittedBy))
      .where(where)
      .orderBy(sql`case when ${supplierSubmissions.status} = 'pending' then 0 else 1 end`, desc(supplierSubmissions.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(supplierSubmissions).where(where),
  ]);
  return { rows, total: Number(total), page, pageCount: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)) };
}

export async function getSubmission(id: string) {
  return db.query.supplierSubmissions.findFirst({ where: eq(supplierSubmissions.id, id), with: { supplier: true, submitter: true } });
}

/** Product names for the items in a supply submission payload. */
export async function productNamesFor(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; sku: string; unit: string; costPaisa: number; supplierId: string | null; status: string }>();
  const rows = await db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, costPaisa: products.costPaisa, supplierId: products.supplierId, status: products.status })
    .from(products)
    .where(inArray(products.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function vendorDashboard(supplierId: string) {
  const [stats] = await db
    .select({
      productCount: sql<number>`(select count(*)::int from ${products} where supplier_id = ${supplierId} and status <> 'archived')`,
      lowStockCount: sql<number>`(select count(*)::int from ${products} where supplier_id = ${supplierId} and status = 'active' and reorder_level > 0 and stock_qty <= reorder_level)`,
      pendingSubmissions: sql<number>`(select count(*)::int from ${supplierSubmissions} where supplier_id = ${supplierId} and status = 'pending')`,
    })
    .from(sql`(select 1) as one`);
  const lowStock = await db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stockQty: products.stockQty, reorderLevel: products.reorderLevel, reorderQty: products.reorderQty })
    .from(products)
    .where(and(eq(products.supplierId, supplierId), eq(products.status, "active"), sql`${products.reorderLevel} > 0 and ${products.stockQty} <= ${products.reorderLevel}`))
    .orderBy(asc(products.name))
    .limit(20);
  return { ...stats, lowStock };
}
