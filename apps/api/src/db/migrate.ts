import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createOwnerClient } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const { sql, db } = createOwnerClient();
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only run when executed directly (`pnpm db:migrate`), not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('migrations applied');
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
