ALTER TABLE "accounts" ADD COLUMN "owner_user_id" uuid;
--> statement-breakpoint
-- Backfill: the sole (or, if more than one, the first by user_id) admin on
-- each existing account becomes its owner. Falls back to any member if an
-- account somehow has no admin.
UPDATE "accounts" a
SET "owner_user_id" = (
	SELECT am.user_id FROM "account_members" am
	WHERE am.account_id = a.id
	ORDER BY (am.role = 'admin') DESC, am.user_id
	LIMIT 1
)
WHERE a."owner_user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "owner_user_id" SET NOT NULL;
