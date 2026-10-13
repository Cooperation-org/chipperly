ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_recovery" jsonb;--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"result" text NOT NULL,
	"provider_id" text
);--> statement-breakpoint
CREATE INDEX "email_log_to_idx" ON "email_log" ("to_email", "at");--> statement-breakpoint
CREATE TABLE "client_errors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"path" text NOT NULL,
	"commit" text,
	"user_agent" text
);--> statement-breakpoint
CREATE INDEX "client_errors_at_idx" ON "client_errors" ("at");
