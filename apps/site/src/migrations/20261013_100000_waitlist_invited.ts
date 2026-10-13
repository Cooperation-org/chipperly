import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// When the admin site emailed this person the beta code (admin.chipperlyapp.com > Waitlist).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`waitlist\` ADD \`invited_at\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`waitlist\` DROP COLUMN \`invited_at\`;`)
}
