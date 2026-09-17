import { defineConfig } from 'drizzle-kit';

// `generate` only reads schema files and writes SQL; DATABASE_URL is required
// by drizzle-kit's config type but no connection is opened for `generate`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54329/chipperly',
  },
});
