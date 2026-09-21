CREATE TABLE "push_tokens" (
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "push_tokens_user_id_token_pk" PRIMARY KEY("user_id","token")
);
