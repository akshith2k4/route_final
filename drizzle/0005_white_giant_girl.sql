ALTER TABLE "hotels" ADD COLUMN "alternate_load_bags" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_alternate_load_bags_check" CHECK ("hotels"."alternate_load_bags" >= 0);--> statement-breakpoint
UPDATE "hotels" SET "alternate_load_bags" = "load_bags";