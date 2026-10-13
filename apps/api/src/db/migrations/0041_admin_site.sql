ALTER TABLE "accounts" ADD COLUMN "org_tier" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "seat_limit" integer;--> statement-breakpoint
CREATE TABLE "org_billing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"method" text NOT NULL,
	"tier" text NOT NULL,
	"seats" integer NOT NULL,
	"yearly_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"stripe_price_id" text,
	"stripe_payment_link_id" text,
	"stripe_subscription_id" text,
	"url" text,
	"billing_email" text,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX "org_billing_account_idx" ON "org_billing" ("account_id");--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL,
	"admin_email" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE INDEX "admin_actions_at_idx" ON "admin_actions" ("at");
