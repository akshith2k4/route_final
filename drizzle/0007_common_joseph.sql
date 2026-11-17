CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"center_lat" double precision NOT NULL,
	"center_lon" double precision NOT NULL,
	"default_zoom" integer DEFAULT 11 NOT NULL,
	"min_zoom" integer DEFAULT 9 NOT NULL,
	"max_zoom" integer DEFAULT 17 NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"h3_resolution" integer DEFAULT 7 NOT NULL,
	"fallback_speed_kmh" double precision DEFAULT 24 NOT NULL,
	"road_factor" double precision DEFAULT 1.35 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_latitude_check" CHECK ("cities"."center_lat" between -90 and 90),
	CONSTRAINT "cities_longitude_check" CHECK ("cities"."center_lon" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "city_datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"city_id" text NOT NULL,
	"region_index" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"map_label" text NOT NULL,
	"tier" text,
	"route_status" text,
	"lotr_route" text,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"key_areas" text,
	"areas_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lon" double precision NOT NULL,
	"label_lat" double precision NOT NULL,
	"label_lon" double precision NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "regions_city_id_region_index_pk" PRIMARY KEY("city_id","region_index"),
	CONSTRAINT "regions_latitude_check" CHECK ("regions"."center_lat" between -90 and 90),
	CONSTRAINT "regions_longitude_check" CHECK ("regions"."center_lon" between -180 and 180)
);
--> statement-breakpoint
-- The existing rows all belong to Bengaluru, so that city is registered
-- before the new foreign keys are attached.
INSERT INTO "cities" ("id", "name", "display_name", "center_lat", "center_lon", "default_zoom", "min_zoom", "max_zoom", "timezone", "h3_resolution", "fallback_speed_kmh", "road_factor", "settings", "is_active", "sort_order")
VALUES ('bengaluru', 'Bengaluru', 'Bengaluru Urban', 12.9716, 77.5946, 11, 9, 17, 'Asia/Kolkata', 7, 24, 1.35, '{"regionAdjacency":{"0":["4"],"1":["0","2","4"],"3":["0","1"]},"dispatchSubtitle":"Fleet Operations"}'::jsonb, true, 0)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
DROP INDEX "facilities_is_active_idx";--> statement-breakpoint
DROP INDEX "hotels_region_idx";--> statement-breakpoint
DROP INDEX "hotels_day_idx";--> statement-breakpoint
DROP INDEX "vehicles_region_idx";--> statement-breakpoint
DROP INDEX "vehicles_is_active_idx";--> statement-breakpoint
-- The city column has to exist before it can take part in the primary key.
ALTER TABLE "facilities" ADD COLUMN "city_id" text DEFAULT 'bengaluru' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "city_id" text DEFAULT 'bengaluru' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "city_id" text DEFAULT 'bengaluru' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "city_id" text DEFAULT 'bengaluru' NOT NULL;--> statement-breakpoint
-- Hotel, facility and vehicle ids are only unique inside their city.
ALTER TABLE "facilities" DROP CONSTRAINT "facilities_pkey";--> statement-breakpoint
ALTER TABLE "hotels" DROP CONSTRAINT "hotels_pkey";--> statement-breakpoint
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_pkey";--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_city_id_id_pk" PRIMARY KEY("city_id","id");--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_city_id_id_pk" PRIMARY KEY("city_id","id");--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_city_id_id_pk" PRIMARY KEY("city_id","id");--> statement-breakpoint
ALTER TABLE "city_datasets" ADD CONSTRAINT "city_datasets_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_is_active_idx" ON "cities" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "cities_sort_order_idx" ON "cities" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "city_datasets_city_kind_idx" ON "city_datasets" USING btree ("city_id","kind");--> statement-breakpoint
CREATE INDEX "city_datasets_city_idx" ON "city_datasets" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regions_city_code_idx" ON "regions" USING btree ("city_id","code");--> statement-breakpoint
CREATE INDEX "regions_city_idx" ON "regions" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "facilities_city_is_active_idx" ON "facilities" USING btree ("city_id","is_active");--> statement-breakpoint
CREATE INDEX "hotels_city_region_idx" ON "hotels" USING btree ("city_id","region_name");--> statement-breakpoint
CREATE INDEX "hotels_city_day_idx" ON "hotels" USING btree ("city_id","day_plan");--> statement-breakpoint
CREATE INDEX "plans_city_updated_idx" ON "plans" USING btree ("city_id","updated_at");--> statement-breakpoint
CREATE INDEX "vehicles_city_region_idx" ON "vehicles" USING btree ("city_id","region_name");--> statement-breakpoint
CREATE INDEX "vehicles_city_is_active_idx" ON "vehicles" USING btree ("city_id","is_active");
