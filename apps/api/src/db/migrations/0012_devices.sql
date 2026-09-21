CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"profile_id" uuid,
	"platform" text NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
