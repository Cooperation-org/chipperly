CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"rating" integer,
	"contact_email" text,
	"page" text,
	"app_version" text,
	"user_agent" text,
	"account_kind" text,
	"price_bargain" integer,
	"price_expensive" integer,
	"price_too_expensive" integer,
	"status" text DEFAULT 'new' NOT NULL,
	"contact_ok" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
CREATE INDEX "feedback_created_at_idx" ON "feedback" ("created_at");
