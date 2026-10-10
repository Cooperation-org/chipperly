ALTER TABLE "stripe_events" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "status" text;
