import { env } from './env.js';
import { buildApp } from './app.js';
import { closeDb } from './db/client.js';
import { startReminders } from './lib/reminders.js';

const app = await buildApp({ env });
// With CRON_SECRET an outside cron drives reminders (routes/internal.ts); a timer here would double-send.
const stopReminders = env.CRON_SECRET
  ? () => {}
  : startReminders((err) => app.log.error(err, 'routine reminders failed'));

async function shutdown(signal: string): Promise<void> {
  app.log.info(`received ${signal}, shutting down`);
  stopReminders();
  try {
    await app.close();
    await closeDb();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
