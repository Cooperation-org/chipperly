ALTER TABLE "activities" ADD COLUMN "recurrence_weekdays" integer[];
--> statement-breakpoint
UPDATE "activities" SET "recurrence_weekdays" = ARRAY["recurrence_weekday"] WHERE "recurrence_weekday" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "recurrence_weekday";
--> statement-breakpoint
ALTER TABLE "activity_steps" ADD COLUMN "duration_minutes" integer;
