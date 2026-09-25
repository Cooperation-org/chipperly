import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`email_addresses_also_forward_to\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`email\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_addresses\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`email_addresses_also_forward_to_order_idx\` ON \`email_addresses_also_forward_to\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`email_addresses_also_forward_to_parent_id_idx\` ON \`email_addresses_also_forward_to\` (\`_parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`email_addresses_also_forward_to\`;`)
}
