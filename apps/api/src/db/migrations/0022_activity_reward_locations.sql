ALTER TABLE "activities" ADD COLUMN "location_ids" uuid[];
--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "location_ids" uuid[];
--> statement-breakpoint
UPDATE "activities" SET "location_ids" = CASE WHEN "location_id" IS NULL THEN '{}'::uuid[] ELSE ARRAY["location_id"] END;
--> statement-breakpoint
UPDATE "rewards" SET "location_ids" = CASE WHEN "location_id" IS NULL THEN '{}'::uuid[] ELSE ARRAY["location_id"] END;
