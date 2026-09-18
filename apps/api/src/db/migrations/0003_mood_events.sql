CREATE TABLE "mood_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"date" date NOT NULL,
	"delta" integer NOT NULL,
	"level_after" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mood_events_profile_version_idx" ON "mood_events" USING btree ("profile_id","version");
--> statement-breakpoint
CREATE TRIGGER mood_events_sync_version BEFORE INSERT OR UPDATE ON "mood_events" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
