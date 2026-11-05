UPDATE "hotels" SET "day_plan" = 'daily' WHERE "day_plan" = 'unscheduled';--> statement-breakpoint
ALTER TABLE "hotels" DROP CONSTRAINT "hotels_day_plan_check";--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_day_plan_check" CHECK ("hotels"."day_plan" in ('daily', 'day1', 'day2'));