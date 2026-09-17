CREATE TABLE "account_members" (
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "account_members_account_id_user_id_pk" PRIMARY KEY("account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	CONSTRAINT "email_verifications_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"profile_ids" uuid[] NOT NULL,
	"relationship_label" text,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"accepted_at" bigint,
	"invited_by" uuid NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_id" text,
	"user_agent" text,
	"expires_at" bigint NOT NULL,
	"revoked_at" bigint,
	CONSTRAINT "sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"auth_provider" text,
	"auth_provider_id" text,
	"display_name" text NOT NULL,
	"pin_hash" text,
	"email_verified_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"name" text NOT NULL,
	"emoji" text,
	"photo_id" uuid,
	"chip_value" integer DEFAULT 0 NOT NULL,
	"location_id" uuid,
	"recurrence" text,
	"recurrence_weekday" smallint,
	"recurrence_time" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"activity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"photo_id" uuid
);
--> statement-breakpoint
CREATE TABLE "recurrence_skips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"activity_id" uuid NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attitude_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"schedule_item_id" uuid,
	"value" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chip_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"location_id" uuid,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" uuid,
	"created_at" bigint NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"name" text NOT NULL,
	"emoji" text,
	"photo_id" uuid,
	"position" integer NOT NULL,
	"chip_goal" integer DEFAULT 5 NOT NULL,
	"working_for_reward_id" uuid
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"bytes" integer NOT NULL,
	"original_bytes" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_members" (
	"profile_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"relationship_label" text,
	CONSTRAINT "profile_members_profile_id_user_id_pk" PRIMARY KEY("profile_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"avatar_emoji" text,
	"avatar_photo_id" uuid,
	"share_token" text,
	"first_then_activity_id" uuid,
	"first_then_reward_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	CONSTRAINT "profiles_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"name" text NOT NULL,
	"emoji" text,
	"photo_id" uuid,
	"chip_cost" integer,
	"location_id" uuid,
	"always_available" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"date" date NOT NULL,
	"position" integer NOT NULL,
	"activity_id" uuid NOT NULL,
	"start_time" text,
	"part_of_day" text,
	"source" text NOT NULL,
	"completed_at" bigint,
	"completed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "step_completions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"schedule_item_id" uuid NOT NULL,
	"activity_step_id" uuid NOT NULL,
	"completed_at" bigint NOT NULL,
	"completed_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_stories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"title" text NOT NULL,
	"emoji" text,
	"cover_photo_id" uuid,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"client_updated_at" bigint NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" bigint,
	"story_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"emoji" text,
	"photo_id" uuid
);
--> statement-breakpoint
CREATE INDEX "activities_profile_version_idx" ON "activities" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "activity_steps_profile_version_idx" ON "activity_steps" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "recurrence_skips_profile_version_idx" ON "recurrence_skips" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "attitude_checks_profile_version_idx" ON "attitude_checks" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "chip_ledger_profile_version_idx" ON "chip_ledger" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "locations_profile_version_idx" ON "locations" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "rewards_profile_version_idx" ON "rewards" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "schedule_items_profile_version_idx" ON "schedule_items" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "step_completions_profile_version_idx" ON "step_completions" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "social_stories_profile_version_idx" ON "social_stories" USING btree ("profile_id","version");--> statement-breakpoint
CREATE INDEX "story_pages_profile_version_idx" ON "story_pages" USING btree ("profile_id","version");