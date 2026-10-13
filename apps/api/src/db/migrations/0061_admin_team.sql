CREATE TABLE "admin_team" (
	"email" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"added_by" text NOT NULL,
	"added_at" bigint NOT NULL
);
