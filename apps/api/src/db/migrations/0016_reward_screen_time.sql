ALTER TABLE "rewards" ADD COLUMN "screen_time_minutes" integer;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "screen_time_packages" text[];--> statement-breakpoint
-- Existing profiles get the same minutes new ones are seeded with; apps stay unset until a caregiver picks them.
UPDATE "rewards" SET "screen_time_minutes" = CASE "name" WHEN 'Screen Time - 15 min' THEN 15 WHEN 'Screen Time - 30 min' THEN 30 WHEN 'Screen Time - 1 hour' THEN 60 END WHERE "name" IN ('Screen Time - 15 min', 'Screen Time - 30 min', 'Screen Time - 1 hour');
