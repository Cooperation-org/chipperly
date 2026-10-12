import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Data only, no schema change. The seed skips posts that already exist, so the
// live "what-is-a-visual-schedule" post kept "care team" after seed/posts.ts
// was reworded. Replaces just those two sentences; a no-op where they were edited.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [from, to] of PAIRS) {
    await db.run(sql`UPDATE \`posts\` SET \`content\` = REPLACE(\`content\`, ${from}, ${to}) WHERE \`content\` LIKE ${`%${from}%`};`)
    await db.run(
      sql`UPDATE \`_posts_v\` SET \`version_content\` = REPLACE(\`version_content\`, ${from}, ${to}) WHERE \`version_content\` LIKE ${`%${from}%`};`,
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const [to, from] of PAIRS) {
    await db.run(sql`UPDATE \`posts\` SET \`content\` = REPLACE(\`content\`, ${from}, ${to}) WHERE \`content\` LIKE ${`%${from}%`};`)
    await db.run(
      sql`UPDATE \`_posts_v\` SET \`version_content\` = REPLACE(\`version_content\`, ${from}, ${to}) WHERE \`version_content\` LIKE ${`%${from}%`};`,
    )
  }
}

const PAIRS: readonly (readonly [string, string])[] = [
  ['the whole care team the same plan', 'the whole support team the same plan'],
  ['everyone on the care team sees the same plan', 'everyone on the support team sees the same plan'],
]
