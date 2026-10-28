CREATE TABLE "star_mart"."stock_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"purchase_item_id" uuid,
	"supplier_id" uuid,
	"source" text NOT NULL,
	"batch_code" text,
	"expiry" date,
	"received_qty" numeric(12, 3) DEFAULT 0 NOT NULL,
	"qty_remaining" numeric(12, 3) DEFAULT 0 NOT NULL,
	"unit_cost_paisa" bigint,
	"soon_alerted_at" timestamp with time zone,
	"expired_alerted_at" timestamp with time zone,
	"written_off_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_batches_remaining_nonneg" CHECK ("star_mart"."stock_batches"."qty_remaining" >= 0)
);
--> statement-breakpoint
ALTER TABLE "star_mart"."products" ADD COLUMN "tracks_expiry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "star_mart"."products" ADD COLUMN "shelf_life_days" integer;--> statement-breakpoint
ALTER TABLE "star_mart"."products" ADD COLUMN "expiry_warning_days" integer;--> statement-breakpoint
ALTER TABLE "star_mart"."stock_movements" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "star_mart"."stock_batches" ADD CONSTRAINT "stock_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "star_mart"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."stock_batches" ADD CONSTRAINT "stock_batches_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "star_mart"."purchase_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."stock_batches" ADD CONSTRAINT "stock_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "star_mart"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."stock_batches" ADD CONSTRAINT "stock_batches_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_batches_product_expiry_idx" ON "star_mart"."stock_batches" USING btree ("product_id","expiry") WHERE "star_mart"."stock_batches"."qty_remaining" > 0;--> statement-breakpoint
CREATE INDEX "stock_batches_open_expiry_idx" ON "star_mart"."stock_batches" USING btree ("expiry") WHERE "star_mart"."stock_batches"."qty_remaining" > 0;--> statement-breakpoint
CREATE INDEX "stock_batches_purchase_item_idx" ON "star_mart"."stock_batches" USING btree ("purchase_item_id");--> statement-breakpoint
ALTER TABLE "star_mart"."stock_movements" ADD CONSTRAINT "stock_movements_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "star_mart"."stock_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_batch_idx" ON "star_mart"."stock_movements" USING btree ("batch_id");--> statement-breakpoint
-- Backfill: stock on hand before batch tracking becomes one undated OPENING batch per product,
-- so every unit belongs to a batch. Managers can set its expiry from the product's Batches tab.
INSERT INTO "star_mart"."stock_batches" ("product_id", "supplier_id", "source", "batch_code", "expiry", "received_qty", "qty_remaining", "unit_cost_paisa")
SELECT "id", "supplier_id", 'opening', 'OPENING', NULL, "stock_qty", "stock_qty", "cost_paisa"
FROM "star_mart"."products" WHERE "stock_qty" > 0;
