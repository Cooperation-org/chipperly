import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  BackupDateSchema,
  RestoreAccountBodySchema,
  RestoreAllBodySchema,
  type BackupAccount,
  type BackupAccountPreview,
  type BackupList,
  type BackupSummary,
  type RestoreAccountResult,
  type RestoreStatus,
} from '@chipperly/shared/schemas/backup';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import { env } from '../env.js';
import {
  backupSummary,
  fileBackupSource,
  previewAccountRestore,
  readRestoreStatus,
  restoreAccount,
  searchBackupAccounts,
  startFullRestore,
  type BackupSource,
} from '../lib/backups.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireSuperAdmin } from './admin.js';

const DateParam = z.object({ date: BackupDateSchema });
const AccountParam = z.object({ date: BackupDateSchema, accountId: uuidSchema });

/** Tests swap this for a source that needs no pg_restore. */
let testSource: BackupSource | null = null;
export function setBackupSourceForTests(source: BackupSource | null): void {
  testSource = source;
}

/**
 * The super admin's backup screen: which days exist, what a restore would do, and the restore itself.
 * Off (the list says so, everything else 404s) unless BACKUP_DIR is set, which only the server that
 * keeps the nightly backups does.
 */
export default async function adminBackupRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireUser, requireSuperAdmin] };

  const source = (): BackupSource => {
    if (testSource) return testSource;
    if (!env.BACKUP_DIR) throw new AppError(404, 'not_found', 'This server keeps no backups');
    return fileBackupSource(env.BACKUP_DIR, env.DATABASE_URL_OWNER ?? env.DATABASE_URL);
  };

  app.get('/admin/backups', guard, async (): Promise<BackupList> => {
    if (!testSource && !env.BACKUP_DIR) return { enabled: false, backups: [] };
    return { enabled: true, backups: await source().list() };
  });

  app.get('/admin/backups/:date/summary', guard, async (request): Promise<BackupSummary> => {
    const { date } = DateParam.parse(request.params);
    return backupSummary(source(), date);
  });

  app.get('/admin/backups/:date/accounts', guard, async (request): Promise<{ accounts: BackupAccount[] }> => {
    const { date } = DateParam.parse(request.params);
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(request.query);
    return { accounts: await searchBackupAccounts(source(), date, q) };
  });

  app.get('/admin/backups/:date/accounts/:accountId', guard, async (request): Promise<BackupAccountPreview> => {
    const { date, accountId } = AccountParam.parse(request.params);
    return previewAccountRestore(source(), date, accountId);
  });

  /** One account back to how it was that day. The account's name is typed again. */
  app.post('/admin/backups/:date/accounts/:accountId/restore', guard, async (request): Promise<RestoreAccountResult> => {
    const { date, accountId } = AccountParam.parse(request.params);
    const { confirm } = RestoreAccountBodySchema.parse(request.body);
    const preview = await previewAccountRestore(source(), date, accountId);
    if (confirm.trim() !== preview.account.name.trim()) throw new AppError(400, 'confirm_mismatch', 'The account name does not match');
    const result = await restoreAccount(source(), date, accountId, request.user!.id);
    request.log.warn({ restored_account: accountId, backup: date, by: request.user?.id, rows: result.total, safety_copy: result.safety_copy }, 'account restored from backup');
    return result;
  });

  app.get('/admin/backups/restore-status', guard, async (): Promise<RestoreStatus> => {
    if (!env.BACKUP_DIR) throw new AppError(404, 'not_found', 'This server keeps no backups');
    return readRestoreStatus(env.BACKUP_DIR);
  });

  /** Every account back to that day. Needs the words "RESTORE <date>", and the script that does it on this server. */
  app.post('/admin/backups/:date/restore-all', guard, async (request, reply) => {
    const { date } = DateParam.parse(request.params);
    const { confirm } = RestoreAllBodySchema.parse(request.body);
    if (!env.BACKUP_DIR || !env.BACKUP_RESTORE_SCRIPT) throw new AppError(404, 'not_found', 'A whole-database restore is not set up on this server');
    if (confirm.trim() !== `RESTORE ${date}`) throw new AppError(400, 'confirm_mismatch', `Type RESTORE ${date} to confirm`);
    request.log.warn({ backup: date, by: request.user?.id }, 'whole-database restore started');
    await startFullRestore(env.BACKUP_DIR, env.BACKUP_RESTORE_SCRIPT, date);
    return reply.code(202).send({ started: true });
  });
}
