import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import type { CustomerLite } from "@/lib/customers/queries";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { searchCustomersAction } from "../../customers/actions";
import { checkDiscountCodeAction } from "../../discounts/actions";
import { lookupSaleBarcodeAction, searchProductsForSaleAction } from "../actions";
import { OrderEditor } from "./order-editor";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const raw = await searchParams;
  const settings = await getSettings();
  const customerId = firstParam(raw.customer);
  let initialCustomer: CustomerLite | null = null;
  if (customerId && /^[0-9a-f-]{36}$/i.test(customerId)) {
    const [row] = await db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, type: customers.type, pointsBalance: customers.pointsBalance, creditLimitPaisa: customers.creditLimitPaisa, creditBalancePaisa: customers.creditBalancePaisa, address: customers.address }).from(customers).where(eq(customers.id, customerId)).limit(1);
    initialCustomer = row ?? null;
  }
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">New order</h1>
        <p className="text-sm text-muted-foreground">Phone and walk-in orders for pickup or delivery. Stock is reserved when the order is confirmed.</p>
      </div>
      <OrderEditor settings={{ loyalty: settings.loyalty, delivery: settings.delivery }} canOverridePrices={isManager(user.role)} initialCustomer={initialCustomer} searchProducts={searchProductsForSaleAction} lookupBarcode={lookupSaleBarcodeAction} searchCustomers={searchCustomersAction} checkDiscount={checkDiscountCodeAction} />
    </div>
  );
}
