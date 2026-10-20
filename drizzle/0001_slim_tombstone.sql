CREATE TYPE "star_mart"."shift_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "star_mart"."pos_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"cashier_user_id" uuid NOT NULL,
	"status" "star_mart"."shift_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opening_float_paisa" bigint DEFAULT 0 NOT NULL,
	"expected_cash_paisa" bigint,
	"counted_cash_paisa" bigint,
	"variance_paisa" bigint,
	"notes" text,
	"closed_by" uuid,
	"reopened_at" timestamp with time zone,
	"reopened_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "star_mart"."orders" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "star_mart"."pos_shifts" ADD CONSTRAINT "pos_shifts_cashier_user_id_admin_users_id_fk" FOREIGN KEY ("cashier_user_id") REFERENCES "star_mart"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."pos_shifts" ADD CONSTRAINT "pos_shifts_closed_by_admin_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_mart"."pos_shifts" ADD CONSTRAINT "pos_shifts_reopened_by_admin_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "star_mart"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pos_shifts_number_unique" ON "star_mart"."pos_shifts" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_shifts_one_open_per_cashier" ON "star_mart"."pos_shifts" USING btree ("cashier_user_id") WHERE "star_mart"."pos_shifts"."status" = 'open';--> statement-breakpoint
CREATE INDEX "pos_shifts_cashier_opened_idx" ON "star_mart"."pos_shifts" USING btree ("cashier_user_id","opened_at");--> statement-breakpoint
CREATE INDEX "pos_shifts_status_opened_idx" ON "star_mart"."pos_shifts" USING btree ("status","opened_at");--> statement-breakpoint
ALTER TABLE "star_mart"."orders" ADD CONSTRAINT "orders_shift_id_pos_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "star_mart"."pos_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_shift_idx" ON "star_mart"."orders" USING btree ("shift_id");