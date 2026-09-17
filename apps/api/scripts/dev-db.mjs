import { connectionUrl, ensureDatabase, ensureServer } from './embedded.mjs';

const server = await ensureServer();
await ensureDatabase('chipperly');
await ensureDatabase('chipperly_test');

console.log(`DATABASE_URL=${connectionUrl('chipperly')}`);
console.log('Postgres is running. Press Ctrl+C to stop.');

async function stop() {
  await server.stop();
  process.exit(0);
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

// Keep the process alive; the server runs as a separate child process.
await new Promise(() => {});
