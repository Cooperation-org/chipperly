ALTER TABLE "invites" ADD COLUMN "makes_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "owner_name" text;
