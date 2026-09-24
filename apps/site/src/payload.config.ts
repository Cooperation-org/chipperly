import { postgresAdapter } from '@payloadcms/db-postgres';
import { importExportPlugin } from '@payloadcms/plugin-import-export';
import { redirectsPlugin } from '@payloadcms/plugin-redirects';
import { seoPlugin } from '@payloadcms/plugin-seo';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { buildConfig } from 'payload';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

import { Categories } from './collections/Categories';
import { Media } from './collections/Media';
import { Pages } from './collections/Pages';
import { Posts } from './collections/Posts';
import { Users } from './collections/Users';
import { Waitlist } from './collections/Waitlist';
import { Settings } from './globals/Settings';
import { SITE_NAME, SITE_URL } from './lib/site';

const dirname = path.dirname(fileURLToPath(import.meta.url));

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
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // Dev pushes schema changes straight to the database; production runs
    // the committed migrations in src/migrations (`pnpm payload migrate`).
    push: process.env.NODE_ENV !== 'production',
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
  graphQL: { disable: true },
  plugins: [
    seoPlugin({
      generateTitle: ({ doc }) => (doc as SeoDoc)?.title ? `${(doc as SeoDoc).title} | ${SITE_NAME}` : SITE_NAME,
      generateDescription: ({ doc }) => (doc as SeoDoc)?.excerpt || (doc as SeoDoc)?.intro || '',
      generateURL: ({ doc, collectionSlug }) =>
        `${SITE_URL}${collectionSlug === 'posts' ? '/blog' : ''}/${(doc as SeoDoc)?.slug ?? ''}`,
    }),
    redirectsPlugin({
      collections: ['posts', 'pages'],
      redirectTypes: ['301', '302'],
      overrides: { admin: { group: 'Settings' } },
    }),
    importExportPlugin({ collections: [{ slug: 'waitlist' }, { slug: 'posts' }] }),
  ],
});
