ALTER TABLE "users" ADD COLUMN "personal_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_personal_code_unique" UNIQUE("personal_code");--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "auto_issue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- EARLYCHIPPER is the offer, not a code anyone types: everyone who signs up inside its dates gets their own code under it.
UPDATE "promo_codes" SET "auto_issue" = true WHERE "code" = 'EARLYCHIPPER';--> statement-breakpoint
UPDATE "users" SET "promo_code" = NULL, "promo_code_at" = NULL;--> statement-breakpoint
UPDATE "users" u SET
	"promo_code" = 'EARLYCHIPPER',
	"promo_code_at" = u."created_at",
	"personal_code" = 'EARLY-' || upper(substr(md5(random()::text || u."id"::text), 1, 6))
FROM "promo_codes" p
WHERE p."code" = 'EARLYCHIPPER' AND u."created_at" BETWEEN p."valid_from" AND p."valid_until";
