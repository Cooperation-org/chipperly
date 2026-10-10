ALTER TABLE "users" ADD COLUMN "deactivated_at" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "comp_until" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "comp_note" text;
