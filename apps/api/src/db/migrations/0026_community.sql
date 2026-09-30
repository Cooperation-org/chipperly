ALTER TABLE "users" ADD COLUMN "is_support" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "community_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "community_profiles_nickname_lower" ON "community_profiles" USING btree (lower("nickname"));--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_profile_id" uuid,
	"kind" text NOT NULL,
	"title" text,
	"body" text,
	"payload" jsonb,
	"include_audio" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "community_posts_feed" ON "community_posts" USING btree ("status","created_at" DESC);--> statement-breakpoint
CREATE TABLE "community_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
	"media_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL
);--> statement-breakpoint
CREATE TABLE "community_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
	"author_user_id" uuid NOT NULL,
	"author_profile_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "community_comments_post" ON "community_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" bigint NOT NULL,
	"resolved_by" uuid,
	"resolved_at" bigint
);--> statement-breakpoint
CREATE INDEX "community_reports_status" ON "community_reports" USING btree ("status","created_at");
