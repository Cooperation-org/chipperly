ALTER TABLE "accounts" ADD COLUMN "org_type" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "org_size_estimate" integer;--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" bigint,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "clusters_account_name_idx" ON "clusters" ("account_id", lower("name")) WHERE "archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "cluster_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "archived_at" bigint;--> statement-breakpoint
CREATE INDEX "profiles_account_cluster_idx" ON "profiles" ("account_id", "cluster_id");
