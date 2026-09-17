import { env } from './env.js';
import { buildApp } from './app.js';
import { closeDb } from './db/client.js';

const app = await buildApp({ env });

async function shutdown(signal: string): Promise<void> {
  app.log.info(`received ${signal}, shutting down`);
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
