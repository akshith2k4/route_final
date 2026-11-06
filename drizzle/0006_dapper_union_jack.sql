CREATE TABLE "facilities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"address" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"is_warehouse" boolean DEFAULT false NOT NULL,
	"is_laundry" boolean DEFAULT false NOT NULL,
	"service_mins" integer DEFAULT 180 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_role_check" CHECK ("facilities"."is_warehouse" = true or "facilities"."is_laundry" = true),
	CONSTRAINT "facilities_latitude_check" CHECK ("facilities"."latitude" between -90 and 90),
	CONSTRAINT "facilities_longitude_check" CHECK ("facilities"."longitude" between -180 and 180),
	CONSTRAINT "facilities_service_mins_check" CHECK ("facilities"."service_mins" >= 0)
);
--> statement-breakpoint
CREATE INDEX "facilities_name_idx" ON "facilities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "facilities_is_active_idx" ON "facilities" USING btree ("is_active");