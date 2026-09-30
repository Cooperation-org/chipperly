CREATE TABLE "day_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"title" text NOT NULL,
	"emoji" text,
	"photo_id" uuid,
	"note" text,
	"what_to_wear" text,
	"story_id" uuid,
	"date" date NOT NULL,
	"start_time" text,
	"recurrence" text,
	"recurrence_weekdays" integer[],
	"remind_days_before" integer DEFAULT 0 NOT NULL,
	"remind_hour" integer DEFAULT 8 NOT NULL,
	"reminder_dismissed" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "day_events_profile_version_idx" ON "day_events" USING btree ("profile_id","version");
--> statement-breakpoint
CREATE INDEX "day_events_profile_date_idx" ON "day_events" USING btree ("profile_id","date");
--> statement-breakpoint
CREATE TRIGGER day_events_sync_version BEFORE INSERT OR UPDATE ON "day_events" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
