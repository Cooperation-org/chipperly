CREATE TABLE "sync_rejections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"device_id" text,
	"profile_id" uuid,
	"table_name" text NOT NULL,
	"row_id" uuid NOT NULL,
	"op" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"payload" jsonb,
	"alerted_at" bigint,
	"resolved_at" bigint,
	"resolution" text
);--> statement-breakpoint
CREATE UNIQUE INDEX "sync_rejections_dedupe_idx" ON "sync_rejections" ("row_id","client_updated_at","reason","source");--> statement-breakpoint
CREATE INDEX "sync_rejections_open_idx" ON "sync_rejections" ("resolved_at","created_at");--> statement-breakpoint
CREATE TABLE "sync_health_digests" (
	"day" text PRIMARY KEY NOT NULL,
	"sent_at" bigint NOT NULL,
	"summary" jsonb
);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_pending" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_oldest_at" bigint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_held" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_dead" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_reported_at" bigint;
