CREATE TABLE "family_handovers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" bigint NOT NULL,
	"used_at" bigint,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "family_handovers_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE UNIQUE INDEX "family_handovers_once_idx" ON "family_handovers" ("profile_id", "user_id", "reason");--> statement-breakpoint
CREATE INDEX "family_handovers_user_idx" ON "family_handovers" ("user_id");
