CREATE SCHEMA "star_mart";
--> statement-breakpoint
CREATE TYPE "star_mart"."admin_role" AS ENUM('super_admin', 'admin', 'cashier', 'vendor');--> statement-breakpoint
CREATE TYPE "star_mart"."customer_type" AS ENUM('retail', 'wholesale');--> statement-breakpoint
CREATE TYPE "star_mart"."discount_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "star_mart"."email_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "star_mart"."expense_method" AS ENUM('cash', 'card', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "star_mart"."invoice_status" AS ENUM('issued', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "star_mart"."loyalty_kind" AS ENUM('earn', 'redeem', 'adjust', 'reverse');--> statement-breakpoint
CREATE TYPE "star_mart"."order_channel" AS ENUM('pos', 'phone', 'walk_in');--> statement-breakpoint
CREATE TYPE "star_mart"."order_fulfillment" AS ENUM('pickup', 'delivery');--> statement-breakpoint
CREATE TYPE "star_mart"."order_status" AS ENUM('pending', 'confirmed', 'ready', 'out_for_delivery', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "star_mart"."pay_status" AS ENUM('unpaid', 'partial', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "star_mart"."payment_method" AS ENUM('cash', 'card', 'bank_transfer', 'credit');--> statement-breakpoint
CREATE TYPE "star_mart"."product_status" AS ENUM('active', 'draft', 'archived');--> statement-breakpoint
CREATE TYPE "star_mart"."purchase_status" AS ENUM('draft', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "star_mart"."stock_adjustment_reason" AS ENUM('damaged', 'expired', 'count_correction', 'theft', 'other');--> statement-breakpoint
CREATE TYPE "star_mart"."stock_movement_kind" AS ENUM('purchase', 'purchase_return', 'sale', 'sale_return', 'adjustment', 'stock_take', 'initial');--> statement-breakpoint
CREATE TYPE "star_mart"."submission_kind" AS ENUM('product', 'supply');--> statement-breakpoint
CREATE TYPE "star_mart"."submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "star_mart"."supplier_payment_method" AS ENUM('cash', 'bank_transfer', 'card', 'other');--> statement-breakpoint
CREATE TABLE "star_mart"."admin_audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "star_mart"."admin_audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."admin_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "star_mart"."admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "star_mart"."admin_role" DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"session_version" integer DEFAULT 1 NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"supplier_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."customer_credit_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"method" "star_mart"."payment_method" NOT NULL,
	"reference" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_credit_payments_amount_positive" CHECK ("star_mart"."customer_credit_payments"."amount_paisa" > 0),
	CONSTRAINT "customer_credit_payments_method" CHECK ("star_mart"."customer_credit_payments"."method" <> 'credit')
);
--> statement-breakpoint
CREATE TABLE "star_mart"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"type" "star_mart"."customer_type" DEFAULT 'retail' NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"credit_limit_paisa" bigint DEFAULT 0 NOT NULL,
	"credit_balance_paisa" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_points_nonneg" CHECK ("star_mart"."customers"."points_balance" >= 0),
	CONSTRAINT "customers_credit_nonneg" CHECK ("star_mart"."customers"."credit_balance_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "star_mart"."discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "star_mart"."discount_kind" NOT NULL,
	"value" bigint NOT NULL,
	"min_order_paisa" bigint DEFAULT 0 NOT NULL,
	"max_discount_paisa" bigint,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_value_range" CHECK (("star_mart"."discount_codes"."kind" = 'percent' and "star_mart"."discount_codes"."value" between 1 and 10000) or ("star_mart"."discount_codes"."kind" = 'fixed' and "star_mart"."discount_codes"."value" > 0))
);
--> statement-breakpoint
CREATE TABLE "star_mart"."document_counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "star_mart"."email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"method" "star_mart"."expense_method" DEFAULT 'cash' NOT NULL,
	"reference" text,
	"incurred_at" date NOT NULL,
	"receipt_url" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("star_mart"."expenses"."amount_paisa" > 0)
);
--> statement-breakpoint
CREATE TABLE "star_mart"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "star_mart"."invoice_status" DEFAULT 'issued' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"pdf_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"points_delta" integer NOT NULL,
	"kind" "star_mart"."loyalty_kind" NOT NULL,
	"order_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_delta_nonzero" CHECK ("star_mart"."loyalty_transactions"."points_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "star_mart"."order_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "star_mart"."order_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"from_status" "star_mart"."order_status",
	"to_status" "star_mart"."order_status" NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit_price_paisa" bigint NOT NULL,
	"cost_paisa" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"discount_paisa" bigint DEFAULT 0 NOT NULL,
	"tax_paisa" bigint DEFAULT 0 NOT NULL,
	"line_total_paisa" bigint NOT NULL,
	CONSTRAINT "order_items_qty_positive" CHECK ("star_mart"."order_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "star_mart"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"channel" "star_mart"."order_channel" NOT NULL,
	"fulfillment" "star_mart"."order_fulfillment" DEFAULT 'pickup' NOT NULL,
	"status" "star_mart"."order_status" DEFAULT 'pending' NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"delivery_address" text,
	"delivery_fee_paisa" bigint DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"subtotal_paisa" bigint NOT NULL,
	"discount_paisa" bigint DEFAULT 0 NOT NULL,
	"points_value_paisa" bigint DEFAULT 0 NOT NULL,
	"tax_paisa" bigint DEFAULT 0 NOT NULL,
	"total_paisa" bigint NOT NULL,
	"paid_paisa" bigint DEFAULT 0 NOT NULL,
	"discount_code_id" uuid,
	"discount_code" text,
	"points_redeemed" integer DEFAULT 0 NOT NULL,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"payment_status" "star_mart"."pay_status" DEFAULT 'unpaid' NOT NULL,
	"notes" text,
	"stock_deducted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "orders_paid_nonneg" CHECK ("star_mart"."orders"."paid_paisa" >= 0),
	CONSTRAINT "orders_total_nonneg" CHECK ("star_mart"."orders"."total_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "star_mart"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "star_mart"."payment_method" NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"received_paisa" bigint,
	"change_paisa" bigint,
	"reference" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_nonzero" CHECK ("star_mart"."payments"."amount_paisa" <> 0)
);
--> statement-breakpoint
CREATE TABLE "star_mart"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"brand" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"allow_fractional" boolean DEFAULT false NOT NULL,
	"cost_paisa" bigint DEFAULT 0 NOT NULL,
	"price_paisa" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"reorder_level" numeric(12, 3) DEFAULT 0 NOT NULL,
	"reorder_qty" numeric(12, 3) DEFAULT 0 NOT NULL,
	"stock_qty" numeric(12, 3) DEFAULT 0 NOT NULL,
	"supplier_id" uuid,
	"image_url" text,
	"image_pathname" text,
	"status" "star_mart"."product_status" DEFAULT 'active' NOT NULL,
	"low_stock_notified_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit_cost_paisa" bigint NOT NULL,
	"line_total_paisa" bigint NOT NULL,
	"batch" text,
	"expiry" date
);
--> statement-breakpoint
CREATE TABLE "star_mart"."purchase_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_id" uuid,
	"product_id" uuid NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "star_mart"."purchase_status" DEFAULT 'draft' NOT NULL,
	"invoice_ref" text,
	"received_at" timestamp with time zone,
	"subtotal_paisa" bigint DEFAULT 0 NOT NULL,
	"total_paisa" bigint DEFAULT 0 NOT NULL,
	"paid_paisa" bigint DEFAULT 0 NOT NULL,
	"payment_status" "star_mart"."pay_status" DEFAULT 'unpaid' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."stock_movements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "star_mart"."stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" uuid NOT NULL,
	"qty_delta" numeric(12, 3) NOT NULL,
	"kind" "star_mart"."stock_movement_kind" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"unit_cost_paisa" bigint,
	"reason" "star_mart"."stock_adjustment_reason",
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."store_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_mart"."supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_id" uuid,
	"amount_paisa" bigint NOT NULL,
	"method" "star_mart"."supplier_payment_method" DEFAULT 'cash' NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_amount_positive" CHECK ("star_mart"."supplier_payments"."amount_paisa" > 0)
);
--> statement-breakpoint
CREATE TABLE "star_mart"."supplier_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"kind" "star_mart"."submission_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "star_mart"."submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid,
	"reviewed_by" uuid,
	"review_note" text,
	"result_product_id" uuid,
	"result_purchase_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "star_mart"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"tax_id" text,
	"payment_terms" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "star_mart"."admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_admin_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_user_id_admin_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "star_mart"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."admin_users" ADD CONSTRAINT "admin_users_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "star_mart"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."admin_users" ADD CONSTRAINT "admin_users_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."customer_credit_payments" ADD CONSTRAINT "customer_credit_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "star_mart"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."customer_credit_payments" ADD CONSTRAINT "customer_credit_payments_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."customers" ADD CONSTRAINT "customers_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."discount_codes" ADD CONSTRAINT "discount_codes_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."email_outbox" ADD CONSTRAINT "email_outbox_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "star_mart"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."expenses" ADD CONSTRAINT "expenses_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "star_mart"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "star_mart"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "star_mart"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "star_mart"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."order_events" ADD CONSTRAINT "order_events_actor_user_id_admin_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "star_mart"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "star_mart"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "star_mart"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "star_mart"."discount_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."orders" ADD CONSTRAINT "orders_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "star_mart"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."payments" ADD CONSTRAINT "payments_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "star_mart"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "star_mart"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."products" ADD CONSTRAINT "products_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "star_mart"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "star_mart"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "star_mart"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "star_mart"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchase_returns" ADD CONSTRAINT "purchase_returns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "star_mart"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "star_mart"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."purchases" ADD CONSTRAINT "purchases_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "star_mart"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."stock_movements" ADD CONSTRAINT "stock_movements_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "star_mart"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "star_mart"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_submissions" ADD CONSTRAINT "supplier_submissions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "star_mart"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_submissions" ADD CONSTRAINT "supplier_submissions_submitted_by_admin_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_submissions" ADD CONSTRAINT "supplier_submissions_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_submissions" ADD CONSTRAINT "supplier_submissions_result_product_id_products_id_fk" FOREIGN KEY ("result_product_id") REFERENCES "star_mart"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."supplier_submissions" ADD CONSTRAINT "supplier_submissions_result_purchase_id_purchases_id_fk" FOREIGN KEY ("result_purchase_id") REFERENCES "star_mart"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_at_idx" ON "star_mart"."admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_idx" ON "star_mart"."admin_audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_target_idx" ON "star_mart"."admin_audit_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_id_idx" ON "star_mart"."admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "star_mart"."admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "star_mart"."admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_users_role_active_idx" ON "star_mart"."admin_users" USING btree ("role","is_active");--> statement-breakpoint
CREATE INDEX "admin_users_supplier_idx" ON "star_mart"."admin_users" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "star_mart"."categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "customer_credit_payments_customer_idx" ON "star_mart"."customer_credit_payments" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_unique" ON "star_mart"."customers" USING btree ("phone") WHERE "star_mart"."customers"."phone" is not null;--> statement-breakpoint
CREATE INDEX "customers_name_lower_idx" ON "star_mart"."customers" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_code_unique" ON "star_mart"."discount_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "email_outbox_status_scheduled_idx" ON "star_mart"."email_outbox" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "email_outbox_created_idx" ON "star_mart"."email_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_unique" ON "star_mart"."expense_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "expenses_incurred_at_idx" ON "star_mart"."expenses" USING btree ("incurred_at");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "star_mart"."expenses" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "star_mart"."invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_unique" ON "star_mart"."invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "loyalty_customer_created_idx" ON "star_mart"."loyalty_transactions" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_order_idx" ON "star_mart"."loyalty_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "loyalty_created_idx" ON "star_mart"."loyalty_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "star_mart"."order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "star_mart"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "star_mart"."order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_unique" ON "star_mart"."orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "star_mart"."orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_completed_idx" ON "star_mart"."orders" USING btree ("status","completed_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "star_mart"."orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "star_mart"."orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "star_mart"."payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_created_idx" ON "star_mart"."payments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "star_mart"."products" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_unique" ON "star_mart"."products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "star_mart"."products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_supplier_idx" ON "star_mart"."products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "star_mart"."products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_name_lower_idx" ON "star_mart"."products" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "products_active_stock_idx" ON "star_mart"."products" USING btree ("stock_qty") WHERE "star_mart"."products"."status" = 'active';--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "star_mart"."purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_product_idx" ON "star_mart"."purchase_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "purchase_returns_supplier_idx" ON "star_mart"."purchase_returns" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_returns_product_idx" ON "star_mart"."purchase_returns" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_number_unique" ON "star_mart"."purchases" USING btree ("number");--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "star_mart"."purchases" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchases_status_received_idx" ON "star_mart"."purchases" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "stock_movements_product_created_idx" ON "star_mart"."stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_ref_idx" ON "star_mart"."stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "star_mart"."supplier_payments" USING btree ("supplier_id","paid_at");--> statement-breakpoint
CREATE INDEX "supplier_payments_purchase_idx" ON "star_mart"."supplier_payments" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_submissions_number_unique" ON "star_mart"."supplier_submissions" USING btree ("number");--> statement-breakpoint
CREATE INDEX "supplier_submissions_status_idx" ON "star_mart"."supplier_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "supplier_submissions_supplier_idx" ON "star_mart"."supplier_submissions" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_unique" ON "star_mart"."suppliers" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "suppliers_active_idx" ON "star_mart"."suppliers" USING btree ("is_active");