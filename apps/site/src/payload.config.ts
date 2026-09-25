import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite';
import { importExportPlugin } from '@payloadcms/plugin-import-export';
import { redirectsPlugin } from '@payloadcms/plugin-redirects';
import { seoPlugin } from '@payloadcms/plugin-seo';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { r2Storage } from '@payloadcms/storage-r2';
import { type CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare';
import path from 'path';
import { buildConfig } from 'payload';
import { fileURLToPath } from 'url';
import type { GetPlatformProxyOptions } from 'wrangler';

import { Categories } from './collections/Categories';
import { Media } from './collections/Media';
import { Pages } from './collections/Pages';
import { Posts } from './collections/Posts';
import { Users } from './collections/Users';
import { Waitlist } from './collections/Waitlist';
import { Settings } from './globals/Settings';
import { SITE_NAME, SITE_URL } from './lib/site';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Runs on Cloudflare: D1 (SQLite) for data, R2 for uploads, one Worker for
// the site and the admin. Nothing here touches the app's server or database.
//
// Inside the deployed Worker the bindings come from the request context.
// Everywhere else (next dev, next build and its workers, the payload CLI,
// the seed script) they come from wrangler: the local D1/R2 under
// .wrangler/state, or the live ones only with CLOUDFLARE_REMOTE_BINDINGS=1,
// which only the deploy scripts set. A laptop or CI can never touch
// production by accident.
const inWorker = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

function fromWrangler(): Promise<CloudflareContext> {
  // Kept out of the Worker bundle: wrangler only exists on a dev machine or CI.
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(({ getPlatformProxy }) =>
    getPlatformProxy({
      environment: process.env.CLOUDFLARE_ENV,
      remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS === '1',
    } satisfies GetPlatformProxyOptions),
  );
}

const cloudflare = inWorker ? await getCloudflareContext({ async: true }) : await fromWrangler();

// Workers logs are searchable when every line is one JSON object.
const log =
  (level: string, fn: typeof console.log) =>
  (objOrMsg: object | string, msg?: string) =>
    fn(JSON.stringify(typeof objOrMsg === 'string' ? { level, msg: objOrMsg } : { level, ...objOrMsg, msg: msg ?? (objOrMsg as { msg?: string }).msg }));
const workersLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || 'info',
  trace: log('trace', console.debug),
  debug: log('debug', console.debug),
  info: log('info', console.log),
  warn: log('warn', console.warn),
  error: log('error', console.error),
  fatal: log('fatal', console.error),
  silent: () => {},
};

type SeoDoc = { title?: string; excerpt?: string; intro?: string; slug?: string };

export default buildConfig({
  serverURL: SITE_URL,
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: ' | Chipperly admin',
      icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/brand/mark.svg' }],
    },
    components: {
      graphics: { Logo: '/components/admin/Logo#Logo', Icon: '/components/admin/Logo#Icon' },
    },
  },
  collections: [Posts, Categories, Pages, Media, Waitlist, Users],
  globals: [Settings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  // Schema changes go through committed migrations (src/migrations), in dev
  // too: `pnpm payload migrate:create <name>`, then `pnpm migrate`.
  db: sqliteD1Adapter({ binding: cloudflare.env.D1, push: false, migrationDir: path.resolve(dirname, 'migrations') }),
  // @ts-expect-error Payload does not export its logger type yet
  logger: inWorker ? workersLogger : undefined,
  graphQL: { disable: true },
  plugins: [
    r2Storage({ bucket: cloudflare.env.R2, collections: { media: true } }),
    seoPlugin({
      generateTitle: ({ doc }) => ((doc as SeoDoc)?.title ? `${(doc as SeoDoc).title} | ${SITE_NAME}` : SITE_NAME),
      generateDescription: ({ doc }) => (doc as SeoDoc)?.excerpt || (doc as SeoDoc)?.intro || '',
      generateURL: ({ doc, collectionSlug }) => `${SITE_URL}${collectionSlug === 'posts' ? '/blog' : ''}/${(doc as SeoDoc)?.slug ?? ''}`,
    }),
    redirectsPlugin({
      collections: ['posts', 'pages'],
      redirectTypes: ['301', '302'],
      overrides: { admin: { group: 'Settings' } },
    }),
    importExportPlugin({ collections: [{ slug: 'waitlist' }, { slug: 'posts' }] }),
  ],
});
