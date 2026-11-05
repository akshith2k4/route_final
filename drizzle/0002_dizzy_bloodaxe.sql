CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"real_capacity" integer DEFAULT 40 NOT NULL,
	"safe_capacity" integer GENERATED ALWAYS AS (GREATEST(1, FLOOR(real_capacity * 0.9)::integer)) STORED,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"region_id" integer,
	"region_name" text,
	"sector" text,
	"depot_id" text DEFAULT 'depot-yeshwanthpur' NOT NULL,
	"departure_time" text DEFAULT '07:00' NOT NULL,
	"return_time" text DEFAULT '17:00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_real_capacity_check" CHECK ("vehicles"."real_capacity" > 0),
	CONSTRAINT "vehicles_safe_capacity_check" CHECK ("vehicles"."safe_capacity" > 0)
);
--> statement-breakpoint
CREATE INDEX "vehicles_name_idx" ON "vehicles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "vehicles_region_idx" ON "vehicles" USING btree ("region_name");--> statement-breakpoint
CREATE INDEX "vehicles_is_active_idx" ON "vehicles" USING btree ("is_active");