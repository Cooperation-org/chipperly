import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_settings_social_platform" AS ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok', 'pinterest', 'threads', 'bluesky', 'whatsapp', 'reddit', 'linkedin');
  CREATE TYPE "public"."enum_settings_share" AS ENUM('facebook', 'x', 'pinterest', 'threads', 'bluesky', 'whatsapp', 'reddit', 'linkedin', 'email', 'copy');
  CREATE TABLE "posts_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );
  
  CREATE TABLE "_posts_v_version_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "pages_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );
  
  CREATE TABLE "_pages_v_version_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "settings_share" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_settings_share",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "settings_social" ALTER COLUMN "label" DROP NOT NULL;
  ALTER TABLE "settings_social" ADD COLUMN "platform" "enum_settings_social_platform" NOT NULL;
  ALTER TABLE "settings" ADD COLUMN "clarity_id" varchar;
  ALTER TABLE "settings" ADD COLUMN "google_verification" varchar;
  ALTER TABLE "settings" ADD COLUMN "bing_verification" varchar;
  ALTER TABLE "posts_faqs" ADD CONSTRAINT "posts_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_faqs" ADD CONSTRAINT "_posts_v_version_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_faqs" ADD CONSTRAINT "pages_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_faqs" ADD CONSTRAINT "_pages_v_version_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_share" ADD CONSTRAINT "settings_share_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_faqs_order_idx" ON "posts_faqs" USING btree ("_order");
  CREATE INDEX "posts_faqs_parent_id_idx" ON "posts_faqs" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_version_faqs_order_idx" ON "_posts_v_version_faqs" USING btree ("_order");
  CREATE INDEX "_posts_v_version_faqs_parent_id_idx" ON "_posts_v_version_faqs" USING btree ("_parent_id");
  CREATE INDEX "pages_faqs_order_idx" ON "pages_faqs" USING btree ("_order");
  CREATE INDEX "pages_faqs_parent_id_idx" ON "pages_faqs" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_version_faqs_order_idx" ON "_pages_v_version_faqs" USING btree ("_order");
  CREATE INDEX "_pages_v_version_faqs_parent_id_idx" ON "_pages_v_version_faqs" USING btree ("_parent_id");
  CREATE INDEX "settings_share_order_idx" ON "settings_share" USING btree ("order");
  CREATE INDEX "settings_share_parent_idx" ON "settings_share" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_version_faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_version_faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings_share" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts_faqs" CASCADE;
  DROP TABLE "_posts_v_version_faqs" CASCADE;
  DROP TABLE "pages_faqs" CASCADE;
  DROP TABLE "_pages_v_version_faqs" CASCADE;
  DROP TABLE "settings_share" CASCADE;
  ALTER TABLE "settings_social" ALTER COLUMN "label" SET NOT NULL;
  ALTER TABLE "settings_social" DROP COLUMN "platform";
  ALTER TABLE "settings" DROP COLUMN "clarity_id";
  ALTER TABLE "settings" DROP COLUMN "google_verification";
  ALTER TABLE "settings" DROP COLUMN "bing_verification";
  DROP TYPE "public"."enum_settings_social_platform";
  DROP TYPE "public"."enum_settings_share";`)
}
