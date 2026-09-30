ALTER TABLE "community_posts" ADD COLUMN "price_amount" integer;--> statement-breakpoint
ALTER TABLE "community_posts" ADD COLUMN "price_currency" text;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_price_together" CHECK (("price_amount" IS NULL) = ("price_currency" IS NULL) AND ("price_amount" IS NULL OR "price_amount" > 0));--> statement-breakpoint
CREATE TABLE "community_sellers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_account_id" text NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"last_event_at" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "community_sellers_stripe_account" ON "community_sellers" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE TABLE "community_purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL REFERENCES "community_posts"("id"),
	"buyer_user_id" uuid NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"application_fee_amount" integer DEFAULT 0 NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"created_at" bigint NOT NULL,
	"paid_at" bigint
);--> statement-breakpoint
CREATE UNIQUE INDEX "community_purchases_post_buyer" ON "community_purchases" USING btree ("post_id","buyer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_purchases_session" ON "community_purchases" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "community_purchases_buyer" ON "community_purchases" USING btree ("buyer_user_id","status");
