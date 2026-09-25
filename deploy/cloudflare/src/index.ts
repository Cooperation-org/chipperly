import { Container } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

/** Every var the API's env.ts reads that we set from the Worker. Unset ones are skipped so env.ts defaults apply. */
const FORWARDED = [
  'DATABASE_URL', 'DATABASE_URL_OWNER', 'JWT_SECRET', 'APP_ORIGIN', 'LOG_LEVEL', 'CRON_SECRET',
  'STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_BASE',
  'BETA_INVITE_CODE', 'SUPER_ADMIN_EMAILS', 'RESEND_API_KEY', 'MAIL_FROM',
  'GOOGLE_OAUTH_CLIENT_ID', 'APPLE_SIGNIN_CLIENT_ID', 'APPLE_SIGNIN_TEAM_ID', 'APPLE_SIGNIN_KEY_ID', 'APPLE_SIGNIN_PRIVATE_KEY',
  'FIREBASE_SERVICE_ACCOUNT_JSON', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
  'TEST_ENDPOINTS', // e2e only, never set in production
] as const;

const vars = env as unknown as Record<string, unknown>;
const cronHeaders = () => ({ 'x-cron-secret': String(vars.CRON_SECRET) });

export class ChipperlyApi extends Container {
  defaultPort = 8080;
  // Sleeps when idle; the hourly cron wakes it for reminders.
  sleepAfter = '5m';
  envVars = Object.fromEntries(
    FORWARDED.filter((k) => typeof vars[k] === 'string' && vars[k] !== '').map((k) => [k, vars[k] as string]),
  );

  // A video transcode runs after its upload request returns; don't stop mid-job.
  override async onActivityExpired(): Promise<void> {
    const res = await this.containerFetch('http://container/api/internal/busy', { headers: cronHeaders() }).catch(() => null);
    const busy = res?.ok ? ((await res.json()) as { busy: boolean }).busy : false;
    if (busy) this.renewActivityTimeout();
    else await this.stop();
  }
}

type Env = { API: DurableObjectNamespace<ChipperlyApi>; ASSETS: Fetcher };

// One instance: the rate limiter and video queue live in process memory.
const api = (e: Env) => e.API.getByName('api');

export default {
  // Only /api/* reaches here (assets.run_worker_first); the rest is static.
  async fetch(request, e) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return e.ASSETS.fetch(request);
    // The cron routes are for scheduled() only, never the public internet.
    if (url.pathname.startsWith('/api/internal/')) return new Response('Not found', { status: 404 });
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
    return api(e).fetch(new Request(request, { headers }));
  },

  // Reminders match on the user's local hour, so hourly is enough.
  async scheduled(_event, e, ctx) {
    ctx.waitUntil(api(e).fetch('http://container/api/internal/reminders', { method: 'POST', headers: cronHeaders() }));
  },
} satisfies ExportedHandler<Env>;
