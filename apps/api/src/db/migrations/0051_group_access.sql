CREATE TABLE "cluster_members" (
	"user_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "cluster_members_user_id_cluster_id_pk" PRIMARY KEY("user_id", "cluster_id")
);--> statement-breakpoint
CREATE INDEX "cluster_members_account_idx" ON "cluster_members" ("account_id", "cluster_id");--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "cluster_ids" uuid[] DEFAULT '{}' NOT NULL;
