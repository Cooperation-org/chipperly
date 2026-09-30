ALTER TABLE "community_profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "community_profiles" ADD COLUMN "avatar_emoji" text;--> statement-breakpoint
ALTER TABLE "community_profiles" ADD CONSTRAINT "community_profiles_bio_length" CHECK ("bio" IS NULL OR char_length("bio") <= 200);
