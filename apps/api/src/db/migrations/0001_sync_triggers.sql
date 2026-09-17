CREATE SEQUENCE IF NOT EXISTS sync_version_seq;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_sync_version() RETURNS trigger AS $$
BEGIN
  NEW.version := nextval('sync_version_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER locations_sync_version BEFORE INSERT OR UPDATE ON "locations" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER activities_sync_version BEFORE INSERT OR UPDATE ON "activities" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER activity_steps_sync_version BEFORE INSERT OR UPDATE ON "activity_steps" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER recurrence_skips_sync_version BEFORE INSERT OR UPDATE ON "recurrence_skips" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER rewards_sync_version BEFORE INSERT OR UPDATE ON "rewards" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER schedule_items_sync_version BEFORE INSERT OR UPDATE ON "schedule_items" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER step_completions_sync_version BEFORE INSERT OR UPDATE ON "step_completions" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER chip_ledger_sync_version BEFORE INSERT OR UPDATE ON "chip_ledger" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER social_stories_sync_version BEFORE INSERT OR UPDATE ON "social_stories" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER story_pages_sync_version BEFORE INSERT OR UPDATE ON "story_pages" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER attitude_checks_sync_version BEFORE INSERT OR UPDATE ON "attitude_checks" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
--> statement-breakpoint
CREATE TRIGGER profiles_sync_version BEFORE INSERT OR UPDATE ON "profiles" FOR EACH ROW EXECUTE FUNCTION set_sync_version();
