ALTER TABLE "profile_members" ADD COLUMN "assigned_location_id" uuid;
--> statement-breakpoint
ALTER TABLE "profile_members" ADD COLUMN "location_notify_mode" text;
