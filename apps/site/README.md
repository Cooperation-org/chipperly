# Chipperly marketing site

chipperlyapp.com: the public site, blog and CMS. Next.js 16 with Payload 3 running inside it, so the admin lives at `/admin` in the same app. It has its own Postgres database (never the app's: both have a `users` table).

## Run it locally

```bash
pnpm -F @chipperly/api db:start          # embedded Postgres, creates chipperly_site too
cp apps/site/.env.example apps/site/.env # fill PAYLOAD_SECRET and the SEED_ADMIN_* pair
pnpm -F @chipperly/site seed             # first admin, categories, settings, 3 starter posts
pnpm -F @chipperly/site dev              # http://localhost:3100, admin at /admin
```

In dev the schema is pushed straight to the database. After changing a collection or field, run `pnpm -F @chipperly/site payload migrate:create <name>` and commit the file in `src/migrations/`. Production runs `pnpm -F @chipperly/site migrate` before `next build`, and the build reads the database, so it has to be reachable at build time.

Run `pnpm -F @chipperly/site generate:types` after schema changes, and `generate:importmap` after adding an admin component.

## What editors can do in /admin

| Area | What it holds |
| --- | --- |
| Posts | Blog posts: drafts, scheduled publishing, version history, preview, hero image, categories, related posts, authors and an SEO tab (title, description, share image, noindex) |
| Categories | Blog categories at `/blog/category/<slug>` |
| Pages | Free-form pages at `/<slug>` (press kit, resources). Home, Features and About are designed in code (`src/app/(site)`, copy in `src/lib/content.ts`) |
| Media | Images. Alt text is required. Resized to webp on upload |
| Waitlist | Sign-ups from the "Join the waitlist" form. Export to CSV from the list view |
| Redirects | 301/302 redirects for moved posts or pages |
| Site settings | Announcement bar, "app is open to the public" switch (turns every waitlist button into "Get started"), contact email, social profiles |
| Users | Editors. Name, role and bio show as the byline on posts |

## SEO

- Per-page `<title>`, description, canonical, Open Graph and Twitter tags (`src/lib/seo.ts`); posts and pages take overrides from their SEO tab.
- JSON-LD: Organization, WebSite, SoftwareApplication, FAQPage, Person (founder), Blog, BlogPosting and BreadcrumbList (`src/lib/jsonld.ts`).
- `/sitemap.xml`, `/robots.txt`, `/blog/rss.xml` and `/llms.txt` are generated from the CMS. Anything marked noindex stays out of all of them.
- Share images: the SEO image if set, otherwise one drawn at `/og?title=...`.
- Pages are static or cached (ISR, one hour) and refreshed as soon as an editor saves.

## Product screenshots

`public/screens/*.webp` come from the public demo: `node apps/site/scripts/capture-screens.mjs` (needs the demo login, see the script). Uploaded family photos are swapped for emoji before capture. The child view (`child-home.webp`) is taken from the e2e run instead.

## Environment

See `.env.example`. `NEXT_PUBLIC_SITE_URL` must be the real domain in production: canonicals, the sitemap and JSON-LD are built from it. `NEXT_PUBLIC_APP_URL` is where "Sign in" and "Try the app" go.
