import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`newsletters_send_log\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`at\` text,
  	\`kind\` text,
  	\`audience\` text,
  	\`sent\` numeric,
  	\`skipped\` numeric,
  	\`failed\` numeric,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`newsletters\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`newsletters_send_log_order_idx\` ON \`newsletters_send_log\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`newsletters_send_log_parent_id_idx\` ON \`newsletters_send_log\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`newsletters\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`subject\` text NOT NULL,
  	\`body\` text NOT NULL,
  	\`audience\` text DEFAULT 'waitlist' NOT NULL,
  	\`status\` text DEFAULT 'draft',
  	\`scheduled_for\` text,
  	\`send_test\` integer DEFAULT false,
  	\`send_now\` integer DEFAULT false,
  	\`sent_at\` text,
  	\`source_post_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`source_post_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`newsletters_source_post_idx\` ON \`newsletters\` (\`source_post_id\`);`)
  await db.run(sql`CREATE INDEX \`newsletters_updated_at_idx\` ON \`newsletters\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`newsletters_created_at_idx\` ON \`newsletters\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`newsletters_id\` integer REFERENCES newsletters(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_newsletters_id_idx\` ON \`payload_locked_documents_rels\` (\`newsletters_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`newsletters_send_log\`;`)
  await db.run(sql`DROP TABLE \`newsletters\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`posts_id\` integer,
  	\`categories_id\` integer,
  	\`pages_id\` integer,
  	\`media_id\` integer,
  	\`waitlist_id\` integer,
  	\`unsubscribes_id\` integer,
  	\`email_addresses_id\` integer,
  	\`users_id\` integer,
  	\`redirects_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`waitlist_id\`) REFERENCES \`waitlist\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`unsubscribes_id\`) REFERENCES \`unsubscribes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`email_addresses_id\`) REFERENCES \`email_addresses\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`redirects_id\`) REFERENCES \`redirects\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "posts_id", "categories_id", "pages_id", "media_id", "waitlist_id", "unsubscribes_id", "email_addresses_id", "users_id", "redirects_id") SELECT "id", "order", "parent_id", "path", "posts_id", "categories_id", "pages_id", "media_id", "waitlist_id", "unsubscribes_id", "email_addresses_id", "users_id", "redirects_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_waitlist_id_idx\` ON \`payload_locked_documents_rels\` (\`waitlist_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_unsubscribes_id_idx\` ON \`payload_locked_documents_rels\` (\`unsubscribes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_email_addresses_id_idx\` ON \`payload_locked_documents_rels\` (\`email_addresses_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_redirects_id_idx\` ON \`payload_locked_documents_rels\` (\`redirects_id\`);`)
}
