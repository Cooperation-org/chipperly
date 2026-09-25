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
| Posts | Blog posts: drafts, scheduled publishing, version history, preview, hero image, categories, related posts, authors, an FAQ tab (accordion + FAQPage schema) and an SEO tab (title, description, share image, noindex) |
| Categories | Blog categories at `/blog/category/<slug>` |
| Pages | Free-form pages at `/<slug>` (press kit, resources), with the same FAQ and SEO tabs. Home, Features and About are designed in code (`src/app/(site)`, copy in `src/lib/content.ts`) |
| Media | Images. Alt text is required. Resized to webp on upload |
| Waitlist | Sign-ups from the "Join the waitlist" form. Export to CSV from the list view |
| Redirects | 301/302 redirects for moved posts or pages |
| Site settings | General: announcement bar, "app is open to the public" switch (turns every waitlist button into "Get started"), contact email. Social: footer follow icons and which share buttons posts show. Analytics & search: Microsoft Clarity project ID, Google Search Console and Bing verification codes |
| Users | Editors. Name, role and bio show as the byline on posts |

## SEO

- Per-page `<title>`, description, canonical, Open Graph and Twitter tags (`src/lib/seo.ts`); posts and pages take overrides from their SEO tab.
- JSON-LD (`src/lib/jsonld.ts`): Organization (with `sameAs` from the follow links), WebSite, SoftwareApplication, Person (founder), Blog, BlogPosting, BreadcrumbList, and FAQPage on Features and on every post or page that has FAQs.
- `/sitemap.xml`, `/robots.txt`, `/blog/rss.xml`, `/llms.txt` and `/llms-full.txt` (every page and post as Markdown) are generated from the CMS and refreshed the moment an editor saves. Anything marked noindex stays out of all of them.
- Share images: the SEO image if set, otherwise one drawn at `/og?title=...`.
- Search Console: paste the HTML-tag verification code in Site settings (or verify by DNS), then submit `https://<domain>/sitemap.xml` in Search Console. Same for Bing Webmaster Tools.
- Microsoft Clarity: paste the project ID in Site settings. It loads on the public site only, never in `/admin`. Clarity records sessions, so the privacy policy should mention it.
- Pages are static or cached (ISR, one hour) and refreshed as soon as an editor saves.

## Product screenshots

`public/screens/*.webp` come from the public demo: `node apps/site/scripts/capture-screens.mjs` (needs the demo login, see the script). Uploaded family photos are swapped for emoji before capture. The child view (`child-home.webp`) is taken from the e2e run instead.

## Environment

See `.env.example`. `NEXT_PUBLIC_SITE_URL` must be the real domain in production: canonicals, the sitemap and JSON-LD are built from it. `NEXT_PUBLIC_APP_URL` is where "Sign in" and "Try the app" go.
