ALTER TABLE "activities" ADD COLUMN "goal_text" text;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "goal_reward_id" uuid;
--> statement-breakpoint
ALTER TABLE "schedule_items" ADD COLUMN "story_id" uuid;
--> statement-breakpoint
CREATE TABLE "day_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "day_plans_profile_version_idx" ON "day_plans" USING btree ("profile_id","version");
--> statement-breakpoint
CREATE INDEX "day_plans_profile_date_idx" ON "day_plans" USING btree ("profile_id","date");
--> statement-breakpoint
CREATE TRIGGER day_plans_sync_version BEFORE INSERT OR UPDATE ON "day_plans" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
