/**
 * One-off migration CLI: moves accounts, profiles and their content from
 * the old Rails database into ours. See docs/import-rails.md for the full
 * mapping. Usage:
 *
 *   node --env-file=.env --import tsx scripts/import-rails.ts \
 *     --source <RAILS_DATABASE_URL> [--dry-run] [--only-account <id>] [--send-reset-emails]
 */
import { parseArgs } from 'node:util';
import { closeDb } from '../src/db/client.js';
import { importRails } from '../src/import/importRails.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'only-account': { type: 'string' },
      'send-reset-emails': { type: 'boolean', default: false },
    },
  });

  if (!values.source) {
    console.error(
      'Usage: pnpm import:rails --source <RAILS_DATABASE_URL> [--dry-run] [--only-account <id>] [--send-reset-emails]',
    );
    process.exitCode = 1;
    return;
  }

  const summary = await importRails({
    sourceUrl: values.source,
    dryRun: values['dry-run'] === true,
    onlyAccountId: values['only-account'] ? Number(values['only-account']) : undefined,
    sendResetEmails: values['send-reset-emails'] === true,
  });

  console.log(summary.dry_run ? '\n[dry run — nothing was committed]' : '\nImport complete.');
  if (summary.accounts.length === 0) {
    console.log('No matching Rails accounts found.');
  }
  for (const account of summary.accounts) {
    console.log(`\nRails account ${account.rails_account_id} -> ${account.account_id || '(skipped)'}`);
    for (const [table, count] of Object.entries(account.counts)) {
      console.log(`  ${table}: ${count}`);
    }
    for (const note of account.notes) {
      console.log(`  note: ${note}`);
    }
  }
  if (summary.reset_emails_sent > 0) {
    console.log(`\nPassword reset emails sent: ${summary.reset_emails_sent}`);
  }
}

main()
  .then(() => closeDb())
  .catch(async (error: unknown) => {
    console.error(error);
    await closeDb();
    process.exitCode = 1;
  });
