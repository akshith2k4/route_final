CREATE TABLE "hotels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"region_name" text NOT NULL,
	"stop_mins" integer DEFAULT 15 NOT NULL,
	"load_bags" integer DEFAULT 0 NOT NULL,
	"rooms" integer DEFAULT 0 NOT NULL,
	"day_plan" text DEFAULT 'daily' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotels_day_plan_check" CHECK ("hotels"."day_plan" in ('daily', 'day1', 'day2', 'unscheduled')),
	CONSTRAINT "hotels_latitude_check" CHECK ("hotels"."latitude" between -90 and 90),
	CONSTRAINT "hotels_longitude_check" CHECK ("hotels"."longitude" between -180 and 180),
	CONSTRAINT "hotels_stop_mins_check" CHECK ("hotels"."stop_mins" >= 0),
	CONSTRAINT "hotels_load_bags_check" CHECK ("hotels"."load_bags" >= 0),
	CONSTRAINT "hotels_rooms_check" CHECK ("hotels"."rooms" >= 0)
);
--> statement-breakpoint
CREATE INDEX "hotels_region_idx" ON "hotels" USING btree ("region_name");--> statement-breakpoint
CREATE INDEX "hotels_day_idx" ON "hotels" USING btree ("day_plan");--> statement-breakpoint
CREATE INDEX "hotels_name_idx" ON "hotels" USING btree ("name");