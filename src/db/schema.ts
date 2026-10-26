import { relations, sql } from "drizzle-orm";
import {
  pgSchema,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Conventions: uuid ids (ledgers use identity bigints), timestamptz, money as bigint
// paisa (`*_paisa`), quantities as numeric(12,3). Enums are append-only.

// Everything lives in its own Postgres schema so it can never collide with other apps
// sharing the database (the legacy store app owns `public`).
export const appSchema = pgSchema("star_mart");

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const paisa = (name: string) => bigint(name, { mode: "number" });
const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: "number" });
const actor = (name: string) =>
  uuid(name).references((): AnyPgColumn => adminUsers.id, { onDelete: "set null" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const adminRoleEnum = appSchema.enum("admin_role", ["super_admin", "admin", "cashier", "vendor"]);
export type AdminRole = (typeof adminRoleEnum.enumValues)[number];
export const ADMIN_ROLES = adminRoleEnum.enumValues;

export const productStatusEnum = appSchema.enum("product_status", ["active", "draft", "archived"]);
export const PRODUCT_STATUSES = productStatusEnum.enumValues;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const submissionKindEnum = appSchema.enum("submission_kind", ["product", "supply"]);
export const submissionStatusEnum = appSchema.enum("submission_status", ["pending", "approved", "rejected"]);
export const purchaseStatusEnum = appSchema.enum("purchase_status", ["draft", "received", "cancelled"]);
export const payStatusEnum = appSchema.enum("pay_status", ["unpaid", "partial", "paid", "refunded"]);
export type PayStatus = (typeof payStatusEnum.enumValues)[number];
export const supplierPaymentMethodEnum = appSchema.enum("supplier_payment_method", ["cash", "bank_transfer", "card", "other"]);
export const SUPPLIER_PAYMENT_METHODS = supplierPaymentMethodEnum.enumValues;
export const stockMovementKindEnum = appSchema.enum("stock_movement_kind", [
  "purchase",
  "purchase_return",
  "sale",
  "sale_return",
  "adjustment",
  "stock_take",
  "initial",
]);
export type StockMovementKind = (typeof stockMovementKindEnum.enumValues)[number];
export const stockAdjustmentReasonEnum = appSchema.enum("stock_adjustment_reason", [
  "damaged",
  "expired",
  "count_correction",
  "theft",
  "other",
]);
export const STOCK_ADJUSTMENT_REASONS = stockAdjustmentReasonEnum.enumValues;
export const customerTypeEnum = appSchema.enum("customer_type", ["retail", "wholesale"]);
export const CUSTOMER_TYPES = customerTypeEnum.enumValues;
export const loyaltyKindEnum = appSchema.enum("loyalty_kind", ["earn", "redeem", "adjust", "reverse"]);
export const discountKindEnum = appSchema.enum("discount_kind", ["percent", "fixed"]);
export const DISCOUNT_KINDS = discountKindEnum.enumValues;
export const orderChannelEnum = appSchema.enum("order_channel", ["pos", "phone", "walk_in"]);
export const ORDER_CHANNELS = orderChannelEnum.enumValues;
export const orderFulfillmentEnum = appSchema.enum("order_fulfillment", ["pickup", "delivery"]);
export const ORDER_FULFILLMENTS = orderFulfillmentEnum.enumValues;
export const orderStatusEnum = appSchema.enum("order_status", [
  "pending",
  "confirmed",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
]);
export const ORDER_STATUSES = orderStatusEnum.enumValues;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const paymentMethodEnum = appSchema.enum("payment_method", ["cash", "card", "bank_transfer", "credit"]);
export const PAYMENT_METHODS = paymentMethodEnum.enumValues;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const invoiceStatusEnum = appSchema.enum("invoice_status", ["issued", "paid", "void"]);
export const expenseMethodEnum = appSchema.enum("expense_method", ["cash", "card", "bank_transfer"]);
export const EXPENSE_METHODS = expenseMethodEnum.enumValues;
export const emailStatusEnum = appSchema.enum("email_status", ["pending", "sending", "sent", "failed"]);
export const shiftStatusEnum = appSchema.enum("shift_status", ["open", "closed"]);
export const SHIFT_STATUSES = shiftStatusEnum.enumValues;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const UNITS = ["pcs", "kg", "g", "l", "ml", "pack", "box", "dozen"] as const;
export type Unit = (typeof UNITS)[number];

// ---------------------------------------------------------------------------
// Auth (existing)
// ---------------------------------------------------------------------------

export const adminUsers = appSchema.table(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(), // always stored trimmed + lower-cased
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(), // Argon2id PHC string
    role: adminRoleEnum("role").notNull().default("admin"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    // Bumped on every password change/reset: any JWT carrying an older value is dead.
    sessionVersion: integer("session_version").notNull().default(1),
    passwordChangedAt: ts("password_changed_at").notNull().defaultNow(),
    lastLoginAt: ts("last_login_at"),
    // Vendor users belong to exactly one supplier.
    supplierId: uuid("supplier_id").references((): AnyPgColumn => suppliers.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references((): AnyPgColumn => adminUsers.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("admin_users_email_unique").on(t.email),
    index("admin_users_role_active_idx").on(t.role, t.isActive),
    index("admin_users_supplier_idx").on(t.supplierId),
  ],
);

export const adminSessions = appSchema.table(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    revokedReason: text("revoked_reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("admin_sessions_user_id_idx").on(t.userId),
    index("admin_sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const adminLoginAttempts = appSchema.table("admin_login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull().defaultNow(),
});

export const adminAuditLogs = appSchema.table(
  "admin_audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid("actor_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("admin_audit_logs_created_at_idx").on(t.createdAt),
    index("admin_audit_logs_actor_idx").on(t.actorUserId),
    index("admin_audit_logs_target_idx").on(t.targetUserId),
  ],
);

// ---------------------------------------------------------------------------
// Settings & counters
// ---------------------------------------------------------------------------

export const storeSettings = appSchema.table("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const documentCounters = appSchema.table("document_counters", {
  name: text("name").primaryKey(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
});

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const categories = appSchema.table(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_name_unique").on(sql`lower(${t.name})`)],
);

export const suppliers = appSchema.table(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxId: text("tax_id"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suppliers_name_unique").on(sql`lower(${t.name})`), index("suppliers_active_idx").on(t.isActive)],
);

export const products = appSchema.table(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    brand: text("brand"),
    expiryDate: date("expiry_date", { mode: "string" }),
    unit: text("unit").notNull().default("pcs"),
    allowFractional: boolean("allow_fractional").notNull().default(false),
    costPaisa: paisa("cost_paisa").notNull().default(0),
    pricePaisa: paisa("price_paisa").notNull().default(0), // tax-inclusive shelf price
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    reorderLevel: qty("reorder_level").notNull().default(0),
    reorderQty: qty("reorder_qty").notNull().default(0),
    stockQty: qty("stock_qty").notNull().default(0), // cached balance of stock_movements
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    imageUrl: text("image_url"),
    imagePathname: text("image_pathname"),
    status: productStatusEnum("status").notNull().default("active"),
    lowStockNotifiedAt: ts("low_stock_notified_at"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_sku_unique").on(t.sku),
    uniqueIndex("products_barcode_unique").on(t.barcode),
    index("products_category_idx").on(t.categoryId),
    index("products_supplier_idx").on(t.supplierId),
    index("products_status_idx").on(t.status),
    index("products_name_lower_idx").on(sql`lower(${t.name})`),
    index("products_active_stock_idx").on(t.stockQty).where(sql`${t.status} = 'active'`),
  ],
);

// ---------------------------------------------------------------------------
// Supply side
// ---------------------------------------------------------------------------

export type SubmissionPayload =
  | {
      kind: "product";
      name: string;
      sku?: string;
      barcode?: string;
      description?: string;
      unit: string;
      allowFractional: boolean;
      costPaisa: number;
      suggestedPricePaisa: number;
      taxRateBps: number;
      categoryName?: string;
      imageUrl?: string;
      imagePathname?: string;
      note?: string;
    }
  | {
      kind: "supply";
      invoiceRef?: string;
      note?: string;
      items: { productId: string; qty: number; unitCostPaisa: number }[];
    };

export const supplierSubmissions = appSchema.table(
  "supplier_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    kind: submissionKindEnum("kind").notNull(),
    payload: jsonb("payload").$type<SubmissionPayload>().notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),
    submittedBy: actor("submitted_by"),
    reviewedBy: actor("reviewed_by"),
    reviewNote: text("review_note"),
    resultProductId: uuid("result_product_id").references(() => products.id, { onDelete: "set null" }),
    resultPurchaseId: uuid("result_purchase_id").references((): AnyPgColumn => purchases.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    reviewedAt: ts("reviewed_at"),
  },
  (t) => [
    uniqueIndex("supplier_submissions_number_unique").on(t.number),
    index("supplier_submissions_status_idx").on(t.status, t.createdAt),
    index("supplier_submissions_supplier_idx").on(t.supplierId),
  ],
);

export const purchases = appSchema.table(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    status: purchaseStatusEnum("status").notNull().default("draft"),
    invoiceRef: text("invoice_ref"),
    receivedAt: ts("received_at"),
    subtotalPaisa: paisa("subtotal_paisa").notNull().default(0),
    totalPaisa: paisa("total_paisa").notNull().default(0),
    paidPaisa: paisa("paid_paisa").notNull().default(0),
    paymentStatus: payStatusEnum("payment_status").notNull().default("unpaid"),
    notes: text("notes"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("purchases_number_unique").on(t.number),
    index("purchases_supplier_idx").on(t.supplierId),
    index("purchases_status_received_idx").on(t.status, t.receivedAt),
  ],
);

export const purchaseItems = appSchema.table(
  "purchase_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    qty: qty("qty").notNull(),
    unitCostPaisa: paisa("unit_cost_paisa").notNull(),
    lineTotalPaisa: paisa("line_total_paisa").notNull(),
    batch: text("batch"),
    expiry: date("expiry", { mode: "string" }),
  },
  (t) => [index("purchase_items_purchase_idx").on(t.purchaseId), index("purchase_items_product_idx").on(t.productId)],
);

export const supplierPayments = appSchema.table(
  "supplier_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    amountPaisa: paisa("amount_paisa").notNull(),
    method: supplierPaymentMethodEnum("method").notNull().default("cash"),
    reference: text("reference"),
    paidAt: ts("paid_at").notNull().defaultNow(),
    note: text("note"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("supplier_payments_supplier_idx").on(t.supplierId, t.paidAt),
    index("supplier_payments_purchase_idx").on(t.purchaseId),
    check("supplier_payments_amount_positive", sql`${t.amountPaisa} > 0`),
  ],
);

export const purchaseReturns = appSchema.table(
  "purchase_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    qty: qty("qty").notNull(),
    amountPaisa: paisa("amount_paisa").notNull(),
    reason: text("reason"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("purchase_returns_supplier_idx").on(t.supplierId, t.createdAt), index("purchase_returns_product_idx").on(t.productId)],
);

export const stockMovements = appSchema.table(
  "stock_movements",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    qtyDelta: qty("qty_delta").notNull(),
    kind: stockMovementKindEnum("kind").notNull(),
    refType: text("ref_type"), // purchase | order | adjustment | stock_take | purchase_return | initial | submission
    refId: uuid("ref_id"),
    unitCostPaisa: paisa("unit_cost_paisa"),
    reason: stockAdjustmentReasonEnum("reason"),
    note: text("note"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("stock_movements_product_created_idx").on(t.productId, t.createdAt), index("stock_movements_ref_idx").on(t.refType, t.refId)],
);

// ---------------------------------------------------------------------------
// Customers, loyalty, discounts
// ---------------------------------------------------------------------------

export const customers = appSchema.table(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    type: customerTypeEnum("type").notNull().default("retail"),
    pointsBalance: integer("points_balance").notNull().default(0),
    creditLimitPaisa: paisa("credit_limit_paisa").notNull().default(0),
    creditBalancePaisa: paisa("credit_balance_paisa").notNull().default(0), // amount the customer owes
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_phone_unique").on(t.phone).where(sql`${t.phone} is not null`),
    index("customers_name_lower_idx").on(sql`lower(${t.name})`),
    check("customers_points_nonneg", sql`${t.pointsBalance} >= 0`),
    check("customers_credit_nonneg", sql`${t.creditBalancePaisa} >= 0`),
  ],
);

export const loyaltyTransactions = appSchema.table(
  "loyalty_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pointsDelta: integer("points_delta").notNull(),
    kind: loyaltyKindEnum("kind").notNull(),
    orderId: uuid("order_id").references((): AnyPgColumn => orders.id, { onDelete: "set null" }),
    note: text("note"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("loyalty_customer_created_idx").on(t.customerId, t.createdAt),
    index("loyalty_order_idx").on(t.orderId),
    index("loyalty_created_idx").on(t.createdAt),
    check("loyalty_delta_nonzero", sql`${t.pointsDelta} <> 0`),
  ],
);

export const discountCodes = appSchema.table(
  "discount_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // upper-cased
    kind: discountKindEnum("kind").notNull(),
    value: bigint("value", { mode: "number" }).notNull(), // percent => basis points, fixed => paisa
    minOrderPaisa: paisa("min_order_paisa").notNull().default(0),
    maxDiscountPaisa: paisa("max_discount_paisa"),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("discount_codes_code_unique").on(t.code),
    check(
      "discount_codes_value_range",
      sql`(${t.kind} = 'percent' and ${t.value} between 1 and 10000) or (${t.kind} = 'fixed' and ${t.value} > 0)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Orders, payments, invoices
// ---------------------------------------------------------------------------

export const orders = appSchema.table(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    channel: orderChannelEnum("channel").notNull(),
    fulfillment: orderFulfillmentEnum("fulfillment").notNull().default("pickup"),
    status: orderStatusEnum("status").notNull().default("pending"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    shiftId: uuid("shift_id").references((): AnyPgColumn => posShifts.id, { onDelete: "set null" }),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    deliveryAddress: text("delivery_address"),
    deliveryFeePaisa: paisa("delivery_fee_paisa").notNull().default(0),
    scheduledFor: ts("scheduled_for"),
    subtotalPaisa: paisa("subtotal_paisa").notNull(),
    discountPaisa: paisa("discount_paisa").notNull().default(0),
    pointsValuePaisa: paisa("points_value_paisa").notNull().default(0),
    taxPaisa: paisa("tax_paisa").notNull().default(0),
    totalPaisa: paisa("total_paisa").notNull(),
    paidPaisa: paisa("paid_paisa").notNull().default(0),
    discountCodeId: uuid("discount_code_id").references(() => discountCodes.id, { onDelete: "set null" }),
    discountCode: text("discount_code"),
    pointsRedeemed: integer("points_redeemed").notNull().default(0),
    pointsEarned: integer("points_earned").notNull().default(0),
    paymentStatus: payStatusEnum("payment_status").notNull().default("unpaid"),
    notes: text("notes"),
    stockDeductedAt: ts("stock_deducted_at"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [
    uniqueIndex("orders_number_unique").on(t.number),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_status_completed_idx").on(t.status, t.completedAt),
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_created_idx").on(t.createdAt),
    index("orders_shift_idx").on(t.shiftId),
    check("orders_paid_nonneg", sql`${t.paidPaisa} >= 0`),
    check("orders_total_nonneg", sql`${t.totalPaisa} >= 0`),
  ],
);

export const orderItems = appSchema.table(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    sku: text("sku"),
    unit: text("unit").notNull().default("pcs"),
    qty: qty("qty").notNull(),
    unitPricePaisa: paisa("unit_price_paisa").notNull(),
    costPaisa: paisa("cost_paisa").notNull().default(0),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    discountPaisa: paisa("discount_paisa").notNull().default(0),
    taxPaisa: paisa("tax_paisa").notNull().default(0),
    lineTotalPaisa: paisa("line_total_paisa").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    check("order_items_qty_positive", sql`${t.qty} > 0`),
  ],
);

export const orderEvents = appSchema.table(
  "order_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    actorUserId: actor("actor_user_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

export const payments = appSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    amountPaisa: paisa("amount_paisa").notNull(), // negative = refund
    receivedPaisa: paisa("received_paisa"),
    changePaisa: paisa("change_paisa"),
    reference: text("reference"),
    note: text("note"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_created_idx").on(t.createdAt),
    check("payments_amount_nonzero", sql`${t.amountPaisa} <> 0`),
  ],
);

export const customerCreditPayments = appSchema.table(
  "customer_credit_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    amountPaisa: paisa("amount_paisa").notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference"),
    note: text("note"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("customer_credit_payments_customer_idx").on(t.customerId, t.createdAt),
    check("customer_credit_payments_amount_positive", sql`${t.amountPaisa} > 0`),
    check("customer_credit_payments_method", sql`${t.method} <> 'credit'`),
  ],
);

export const invoices = appSchema.table(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: invoiceStatusEnum("status").notNull().default("issued"),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    dueAt: ts("due_at"),
    paidAt: ts("paid_at"),
    emailedAt: ts("emailed_at"),
    pdfGeneratedAt: ts("pdf_generated_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invoices_number_unique").on(t.number), uniqueIndex("invoices_order_unique").on(t.orderId)],
);

// ---------------------------------------------------------------------------
// POS shifts (till sessions with opening float and closing cash count)
// ---------------------------------------------------------------------------

export const posShifts = appSchema.table(
  "pos_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    cashierUserId: uuid("cashier_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "restrict" }),
    status: shiftStatusEnum("status").notNull().default("open"),
    openedAt: ts("opened_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
    openingFloatPaisa: paisa("opening_float_paisa").notNull().default(0),
    expectedCashPaisa: paisa("expected_cash_paisa"),
    countedCashPaisa: paisa("counted_cash_paisa"),
    variancePaisa: paisa("variance_paisa"),
    notes: text("notes"),
    closedBy: actor("closed_by"),
    reopenedAt: ts("reopened_at"),
    reopenedBy: actor("reopened_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pos_shifts_number_unique").on(t.number),
    uniqueIndex("pos_shifts_one_open_per_cashier").on(t.cashierUserId).where(sql`${t.status} = 'open'`),
    index("pos_shifts_cashier_opened_idx").on(t.cashierUserId, t.openedAt),
    index("pos_shifts_status_opened_idx").on(t.status, t.openedAt),
  ],
);

// ---------------------------------------------------------------------------
// Expenses & email outbox
// ---------------------------------------------------------------------------

export const expenseCategories = appSchema.table(
  "expense_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("expense_categories_name_unique").on(sql`lower(${t.name})`)],
);

export const expenses = appSchema.table(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    amountPaisa: paisa("amount_paisa").notNull(),
    method: expenseMethodEnum("method").notNull().default("cash"),
    reference: text("reference"),
    incurredAt: date("incurred_at", { mode: "string" }).notNull(), // store-local YYYY-MM-DD
    receiptUrl: text("receipt_url"),
    createdBy: actor("created_by"),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("expenses_incurred_at_idx").on(t.incurredAt),
    index("expenses_category_idx").on(t.categoryId),
    check("expenses_amount_positive", sql`${t.amountPaisa} > 0`),
  ],
);

export type EmailTemplate = "order_confirmation" | "invoice" | "low_stock" | "supplier_low_stock" | "test_email";

export const emailOutbox = appSchema.table(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    template: text("template").$type<EmailTemplate>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: emailStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    scheduledFor: ts("scheduled_for").notNull().defaultNow(),
    sentAt: ts("sent_at"),
    createdBy: actor("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("email_outbox_status_scheduled_idx").on(t.status, t.scheduledFor), index("email_outbox_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Relations (for db.query.* reads)
// ---------------------------------------------------------------------------

export const adminUsersRelations = relations(adminUsers, ({ many, one }) => ({
  sessions: many(adminSessions),
  supplier: one(suppliers, { fields: [adminUsers.supplierId], references: [suppliers.id] }),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  user: one(adminUsers, { fields: [adminSessions.userId], references: [adminUsers.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({ products: many(products) }));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  purchases: many(purchases),
  payments: many(supplierPayments),
  returns: many(purchaseReturns),
  submissions: many(supplierSubmissions),
  users: many(adminUsers),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
  movements: many(stockMovements),
}));

export const supplierSubmissionsRelations = relations(supplierSubmissions, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierSubmissions.supplierId], references: [suppliers.id] }),
  submitter: one(adminUsers, { fields: [supplierSubmissions.submittedBy], references: [adminUsers.id] }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  items: many(purchaseItems),
  payments: many(supplierPayments),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierPayments.supplierId], references: [suppliers.id] }),
  purchase: one(purchases, { fields: [supplierPayments.purchaseId], references: [purchases.id] }),
}));

export const purchaseReturnsRelations = relations(purchaseReturns, ({ one }) => ({
  supplier: one(suppliers, { fields: [purchaseReturns.supplierId], references: [suppliers.id] }),
  product: one(products, { fields: [purchaseReturns.productId], references: [products.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  actor: one(adminUsers, { fields: [stockMovements.createdBy], references: [adminUsers.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  loyalty: many(loyaltyTransactions),
  creditPayments: many(customerCreditPayments),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  customer: one(customers, { fields: [loyaltyTransactions.customerId], references: [customers.id] }),
  order: one(orders, { fields: [loyaltyTransactions.orderId], references: [orders.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  shift: one(posShifts, { fields: [orders.shiftId], references: [posShifts.id] }),
  cashier: one(adminUsers, { fields: [orders.createdBy], references: [adminUsers.id] }),
  items: many(orderItems),
  payments: many(payments),
  events: many(orderEvents),
  invoice: one(invoices, { fields: [orders.id], references: [invoices.orderId] }),
  discount: one(discountCodes, { fields: [orders.discountCodeId], references: [discountCodes.id] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
  actor: one(adminUsers, { fields: [orderEvents.actorUserId], references: [adminUsers.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  createdBy: one(adminUsers, { fields: [payments.createdBy], references: [adminUsers.id] }),
}));

export const customerCreditPaymentsRelations = relations(customerCreditPayments, ({ one }) => ({
  customer: one(customers, { fields: [customerCreditPayments.customerId], references: [customers.id] }),
}));

export const posShiftsRelations = relations(posShifts, ({ one, many }) => ({
  cashier: one(adminUsers, { fields: [posShifts.cashierUserId], references: [adminUsers.id], relationName: "shiftCashier" }),
  closer: one(adminUsers, { fields: [posShifts.closedBy], references: [adminUsers.id], relationName: "shiftCloser" }),
  reopener: one(adminUsers, { fields: [posShifts.reopenedBy], references: [adminUsers.id], relationName: "shiftReopener" }),
  orders: many(orders),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
}));

export const expenseCategoriesRelations = relations(expenseCategories, ({ many }) => ({ expenses: many(expenses) }));

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type SupplierSubmission = typeof supplierSubmissions.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type DiscountCode = typeof discountCodes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type EmailOutboxRow = typeof emailOutbox.$inferSelect;
export type PosShift = typeof posShifts.$inferSelect;
