ALTER TABLE "devices" ADD COLUMN "report_token" text;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_lat" double precision;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_lng" double precision;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_location_accuracy_m" double precision;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_location_at" bigint;
--> statement-breakpoint
ALTER TABLE "push_tokens" ADD COLUMN "device_id" uuid;
