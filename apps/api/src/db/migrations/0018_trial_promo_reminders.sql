ALTER TABLE "users" ADD COLUMN "trial_ends_at" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "promo_code_at" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "time_zone" text;--> statement-breakpoint
-- Everyone already here gets the full 21 days from today, not a trial that ended while this didn't exist.
UPDATE "users" SET "trial_ends_at" = (extract(epoch from now()) * 1000)::bigint + 21 * 86400000;--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"percent_off" integer,
	"applies_to" text DEFAULT 'annual' NOT NULL,
	"valid_from" bigint NOT NULL,
	"valid_until" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
-- The conference's early access code: sign-ups from 24 Sept to the end of 24 Oct 2026 (UTC). Discount set in the admin dashboard.
INSERT INTO "promo_codes" ("code", "percent_off", "valid_from", "valid_until", "note", "created_at")
VALUES ('EARLYCHIPPER', NULL, 1790208000000, 1792886399000, 'Beta early access, annual plan', (extract(epoch from now()) * 1000)::bigint);--> statement-breakpoint
CREATE TABLE "review_reminders" (
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"every_days" integer DEFAULT 7 NOT NULL,
	"hour" integer DEFAULT 19 NOT NULL,
	"last_sent_at" bigint,
	CONSTRAINT "review_reminders_user_id_profile_id_pk" PRIMARY KEY("user_id","profile_id")
);
