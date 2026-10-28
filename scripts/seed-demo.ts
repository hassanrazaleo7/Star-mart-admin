/*
 * Demo data for a fresh database: categories, suppliers (+ vendor logins), products with
 * EAN-13 barcodes, customers, expenses, two received purchases and ~40 completed sales
 * spread over the last 30 days. Idempotent: re-running updates what exists and skips
 * what was already generated. Refuses to run in production.
 *
 *   npm run seed:demo
 */
import "./lib/allow-server-only.cjs";
import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../src/db";
import { adminUsers, categories, customers, expenseCategories, expenses, orders, products, purchases, suppliers } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { createOrder } from "../src/lib/orders/commands";
import { generateEan13 } from "../src/lib/products/barcode";
import { createPurchase } from "../src/lib/purchases/commands";
import { getSettings } from "../src/lib/settings";
import { batchInflowItems } from "../src/lib/stock/batches";
import { addDays } from "../src/lib/stock/expiry";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const VENDOR_PASSWORD = "Vendor-Demo-2026!";
const log = (s: string) => console.log(`• ${s}`);
const daysAgo = (n: number, hour = 12) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d;
};
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]!;

async function main() {
  const actor = await db.query.adminUsers.findFirst({ where: and(eq(adminUsers.role, "super_admin"), eq(adminUsers.isActive, true)) });
  if (!actor) throw new Error("Run `npm run seed:admin` first so a super admin exists.");
  const settings = await getSettings();

  // Categories
  const categoryNames = ["Grocery", "Dairy", "Beverages", "Household", "Snacks"];
  const categoryIds = new Map<string, string>();
  for (const name of categoryNames) {
    const existing = await db.query.categories.findFirst({ where: sql`lower(${categories.name}) = ${name.toLowerCase()}` });
    const row = existing ?? (await db.insert(categories).values({ name }).returning())[0]!;
    categoryIds.set(name, row.id);
  }
  log(`${categoryNames.length} categories`);

  // Suppliers + vendor logins
  const supplierSeed = [
    { name: "Karachi Wholesale Foods", email: "vendor1@star-mart.demo", phone: "021-1234567", contactName: "Ahmed Raza" },
    { name: "Punjab Dairy Co.", email: "vendor2@star-mart.demo", phone: "042-7654321", contactName: "Sana Malik" },
    { name: "Metro Beverages", email: "vendor3@star-mart.demo", phone: "051-5551234", contactName: "Bilal Khan" },
  ];
  const supplierIds: string[] = [];
  for (const s of supplierSeed) {
    const existing = await db.query.suppliers.findFirst({ where: sql`lower(${suppliers.name}) = ${s.name.toLowerCase()}` });
    const row = existing ?? (await db.insert(suppliers).values({ ...s, paymentTerms: "Net 15" }).returning())[0]!;
    supplierIds.push(row.id);
    const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, s.email) });
    if (!user) await db.insert(adminUsers).values({ email: s.email, name: s.contactName, role: "vendor", supplierId: row.id, passwordHash: await hashPassword(VENDOR_PASSWORD), mustChangePassword: false, isActive: true });
  }
  log(`${supplierSeed.length} suppliers with vendor logins (password ${VENDOR_PASSWORD})`);

  // Products
  type P = { sku: string; name: string; category: string; supplier: number; unit: string; fractional?: boolean; cost: number; price: number; tax?: number; reorder: number; stock: number; life?: number; exp?: number };
  const productSeed: P[] = [
    { sku: "RICE-5KG", name: "Basmati Rice 5 kg", category: "Grocery", supplier: 0, unit: "pack", cost: 1450, price: 1699, reorder: 10, stock: 40 },
    { sku: "FLOUR-10KG", name: "Chakki Atta 10 kg", category: "Grocery", supplier: 0, unit: "pack", cost: 1100, price: 1290, reorder: 10, stock: 25 },
    { sku: "SUGAR-1KG", name: "Sugar 1 kg", category: "Grocery", supplier: 0, unit: "kg", fractional: true, cost: 140, price: 165, reorder: 20, stock: 80 },
    { sku: "LENTIL-RED", name: "Red Lentils 1 kg", category: "Grocery", supplier: 0, unit: "kg", fractional: true, cost: 280, price: 330, reorder: 10, stock: 30 },
    { sku: "OIL-5L", name: "Cooking Oil 5 L", category: "Grocery", supplier: 0, unit: "pcs", cost: 2550, price: 2890, reorder: 5, stock: 18 },
    { sku: "SALT-800", name: "Iodised Salt 800 g", category: "Grocery", supplier: 0, unit: "pcs", cost: 45, price: 60, reorder: 15, stock: 60 },
    { sku: "MILK-1L", name: "Full Cream Milk 1 L", category: "Dairy", supplier: 1, unit: "pcs", cost: 230, price: 265, reorder: 24, stock: 48, life: 7, exp: 2 },
    { sku: "YOGURT-500", name: "Yogurt 500 g", category: "Dairy", supplier: 1, unit: "pcs", cost: 150, price: 180, reorder: 12, stock: 30, life: 14, exp: 9 },
    { sku: "BUTTER-200", name: "Butter 200 g", category: "Dairy", supplier: 1, unit: "pcs", cost: 380, price: 440, reorder: 8, stock: 20, life: 90, exp: 60 },
    { sku: "CHEESE-200", name: "Cheddar Cheese 200 g", category: "Dairy", supplier: 1, unit: "pcs", cost: 520, price: 599, reorder: 6, stock: 4, life: 120, exp: -3 },
    { sku: "EGGS-12", name: "Eggs (dozen)", category: "Dairy", supplier: 1, unit: "dozen", cost: 300, price: 345, reorder: 10, stock: 24, life: 21, exp: 12 },
    { sku: "COLA-1.5L", name: "Cola 1.5 L", category: "Beverages", supplier: 2, unit: "pcs", cost: 150, price: 180, tax: 17, reorder: 24, stock: 72 },
    { sku: "WATER-1.5L", name: "Mineral Water 1.5 L", category: "Beverages", supplier: 2, unit: "pcs", cost: 55, price: 80, reorder: 24, stock: 96 },
    { sku: "JUICE-1L", name: "Mango Juice 1 L", category: "Beverages", supplier: 2, unit: "pcs", cost: 210, price: 250, tax: 17, reorder: 12, stock: 36, life: 180, exp: 150 },
    { sku: "TEA-950", name: "Black Tea 950 g", category: "Beverages", supplier: 0, unit: "pcs", cost: 1650, price: 1850, reorder: 5, stock: 3 },
    { sku: "SOAP-4PK", name: "Bath Soap 4-pack", category: "Household", supplier: 0, unit: "pack", cost: 390, price: 450, tax: 17, reorder: 10, stock: 28 },
    { sku: "DETERGENT-3KG", name: "Detergent Powder 3 kg", category: "Household", supplier: 0, unit: "pcs", cost: 1150, price: 1299, tax: 17, reorder: 6, stock: 14 },
    { sku: "TISSUE-200", name: "Facial Tissues 200s", category: "Household", supplier: 0, unit: "box", cost: 160, price: 199, tax: 17, reorder: 10, stock: 2 },
    { sku: "CHIPS-60", name: "Potato Chips 60 g", category: "Snacks", supplier: 2, unit: "pcs", cost: 45, price: 60, tax: 17, reorder: 30, stock: 120 },
    { sku: "BISCUIT-6PK", name: "Digestive Biscuits 6-pack", category: "Snacks", supplier: 2, unit: "pack", cost: 280, price: 330, tax: 17, reorder: 12, stock: 40 },
  ];
  const productIds = new Map<string, string>();
  let created = 0;
  for (const p of productSeed) {
    const existing = await db.query.products.findFirst({ where: eq(products.sku, p.sku) });
    if (existing) {
      productIds.set(p.sku, existing.id);
      continue;
    }
    const barcode = await generateEan13(settings.barcode.prefix);
    const [row] = await db
      .insert(products)
      .values({ sku: p.sku, name: p.name, barcode, categoryId: categoryIds.get(p.category)!, supplierId: supplierIds[p.supplier]!, unit: p.unit, allowFractional: Boolean(p.fractional), costPaisa: p.cost * 100, pricePaisa: p.price * 100, taxRateBps: (p.tax ?? 0) * 100, reorderLevel: p.reorder, reorderQty: p.reorder * 3, status: "active", tracksExpiry: p.life != null, shelfLifeDays: p.life ?? null, createdBy: actor.id })
      .returning({ id: products.id });
    productIds.set(p.sku, row!.id);
    // Perishables get a dated opening batch (cheese is already expired, milk expires soon) to populate the Expiry page.
    const expiry = p.exp != null ? addDays(daysAgo(0).toISOString().slice(0, 10), p.exp) : null;
    const [first, ...rest] = batchInflowItems(
      { productId: row!.id, qty: p.stock, source: "initial", batchCode: expiry ? "OPEN-1" : null, expiry, unitCostPaisa: p.cost * 100, supplierId: supplierIds[p.supplier]!, createdBy: actor.id },
      { kind: "initial", refType: "initial", unitCostPaisa: p.cost * 100, createdBy: actor.id },
    ).items;
    if (first) await db.batch([first, ...rest]);
    created++;
  }
  log(`${productSeed.length} products (${created} new, 3 below reorder level)`);

  // Customers
  const customerSeed = [
    { name: "Ayesha Khan", phone: "03001234567", email: "ayesha@example.com", type: "retail" as const, points: 320, credit: 0 },
    { name: "Hamza Sheikh", phone: "03011234567", email: "hamza@example.com", type: "retail" as const, points: 80, credit: 0 },
    { name: "Fatima Noor", phone: "03021234567", email: null, type: "retail" as const, points: 1250, credit: 0 },
    { name: "Usman Tariq", phone: "03031234567", email: "usman@example.com", type: "wholesale" as const, points: 0, credit: 50000 },
    { name: "Al-Noor Restaurant", phone: "03041234567", email: "orders@alnoor.example.com", type: "wholesale" as const, points: 640, credit: 150000 },
    { name: "Zainab Ali", phone: "03051234567", email: null, type: "retail" as const, points: 15, credit: 0 },
    { name: "Bilal Ahmed", phone: "03061234567", email: "bilal@example.com", type: "retail" as const, points: 0, credit: 10000 },
    { name: "Green Valley School", phone: "03071234567", email: "admin@greenvalley.example.com", type: "wholesale" as const, points: 210, credit: 80000 },
  ];
  const customerIds: string[] = [];
  for (const c of customerSeed) {
    const existing = await db.query.customers.findFirst({ where: eq(customers.phone, c.phone) });
    const row = existing ?? (await db.insert(customers).values({ name: c.name, phone: c.phone, email: c.email, type: c.type, pointsBalance: c.points, creditLimitPaisa: c.credit * 100, createdBy: actor.id }).returning())[0]!;
    customerIds.push(row.id);
  }
  log(`${customerSeed.length} customers`);

  // Expense categories + expenses
  const expenseCats = ["Rent", "Utilities", "Salaries", "Marketing", "Transport", "Maintenance", "Miscellaneous"];
  const expenseCatIds = new Map<string, string>();
  for (const name of expenseCats) {
    const existing = await db.query.expenseCategories.findFirst({ where: sql`lower(${expenseCategories.name}) = ${name.toLowerCase()}` });
    const row = existing ?? (await db.insert(expenseCategories).values({ name }).returning())[0]!;
    expenseCatIds.set(name, row.id);
  }
  const hasDemoExpenses = await db.query.expenses.findFirst({ where: and(eq(expenses.reference, "DEMO"), isNull(expenses.deletedAt)) });
  if (!hasDemoExpenses) {
    const rows = [
      ["Rent", "Shop rent", 60000, 58], ["Rent", "Shop rent", 60000, 28], ["Utilities", "Electricity bill", 18500, 50], ["Utilities", "Electricity bill", 21200, 20], ["Utilities", "Internet", 3500, 45], ["Utilities", "Internet", 3500, 15],
      ["Salaries", "Staff salaries", 120000, 55], ["Salaries", "Staff salaries", 120000, 25], ["Marketing", "Flyers and banners", 7500, 40], ["Marketing", "Social media ads", 5000, 12],
      ["Transport", "Delivery fuel", 4200, 33], ["Transport", "Delivery fuel", 3900, 9], ["Maintenance", "Fridge repair", 8500, 37], ["Miscellaneous", "Cleaning supplies", 2200, 22], ["Miscellaneous", "Stationery", 1300, 5],
    ] as const;
    await db.insert(expenses).values(rows.map(([cat, description, amount, ago]) => ({ categoryId: expenseCatIds.get(cat)!, description, amountPaisa: amount * 100, method: pick(["cash", "bank_transfer", "card"] as const), reference: "DEMO", incurredAt: daysAgo(ago).toISOString().slice(0, 10), createdBy: actor.id })));
    log(`${rows.length} expenses over 60 days`);
  } else log("expenses already seeded");

  // Purchases (received)
  const hasDemoPurchase = await db.query.purchases.findFirst({ where: eq(purchases.invoiceRef, "DEMO-1") });
  if (!hasDemoPurchase) {
    await createPurchase({ supplierId: supplierIds[0]!, invoiceRef: "DEMO-1", notes: "Demo seed", receiveNow: true, lines: [{ productId: productIds.get("RICE-5KG")!, qty: 20, unitCostPaisa: 145000, batch: null, expiry: null }, { productId: productIds.get("OIL-5L")!, qty: 10, unitCostPaisa: 255000, batch: null, expiry: null }, { productId: productIds.get("TEA-950")!, qty: 6, unitCostPaisa: 165000, batch: null, expiry: null }] }, actor.id);
    await createPurchase({ supplierId: supplierIds[1]!, invoiceRef: "DEMO-2", notes: "Demo seed", receiveNow: true, lines: [{ productId: productIds.get("MILK-1L")!, qty: 48, unitCostPaisa: 23000, batch: "B-1021", expiry: daysAgo(-20).toISOString().slice(0, 10) }, { productId: productIds.get("YOGURT-500")!, qty: 24, unitCostPaisa: 15000, batch: "Y-77", expiry: daysAgo(-12).toISOString().slice(0, 10) }] }, actor.id);
    log("2 received purchases");
  } else log("purchases already seeded");

  // Completed sales over the last 30 days
  const hasDemoOrders = await db.query.orders.findFirst({ where: eq(orders.notes, "demo seed") });
  if (!hasDemoOrders) {
    const skus = productSeed.filter((p) => !["CHEESE-200", "TEA-950", "TISSUE-200"].includes(p.sku)).map((p) => p.sku);
    let count = 0;
    for (let day = 29; day >= 0; day--) {
      const perDay = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < perDay; i++) {
        const lineCount = 1 + Math.floor(rnd() * 4);
        const chosen = new Set<string>();
        while (chosen.size < lineCount) chosen.add(pick(skus));
        const lines = [...chosen].map((sku) => ({ productId: productIds.get(sku)!, qty: 1 + Math.floor(rnd() * 3), lineDiscountPaisa: 0 }));
        const customerId = rnd() < 0.5 ? pick(customerIds) : null;
        // Prices are tax inclusive and no discounts apply, so the total is Σ price × qty.
        const totalPaisa = [...chosen].reduce((sum, sku, idx) => sum + productSeed.find((p) => p.sku === sku)!.price * 100 * lines[idx]!.qty, 0);
        const byCard = rnd() < 0.3;
        try {
          const result = await createOrder({ channel: "pos", fulfillment: "pickup", customerId, notes: "demo seed", lines, discountCode: null, pointsToRedeem: 0, payments: [{ method: byCard ? "card" : "cash", amountPaisa: byCard ? totalPaisa : Math.ceil(totalPaisa / 50_000) * 50_000 }], allowPriceOverride: false }, { id: actor.id, role: "super_admin" });
          const when = daysAgo(day, 9 + Math.floor(rnd() * 10));
          await db.update(orders).set({ createdAt: when, completedAt: when, updatedAt: when }).where(eq(orders.id, result.id));
          count++;
        } catch (error) {
          console.warn(`  skipped a sale (${(error as Error).message})`);
        }
      }
    }
    log(`${count} completed POS sales over 30 days`);
  } else log("sales already seeded");

  console.log("\nDemo data ready. Vendor logins: vendor1@star-mart.demo / vendor2@… / vendor3@… with password " + VENDOR_PASSWORD);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
