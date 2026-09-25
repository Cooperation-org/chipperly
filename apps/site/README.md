# Chipperly marketing site

chipperlyapp.com: the public site, blog and CMS. Next.js 16 with Payload 3 running inside it, so the admin lives at `/admin` in the same app.

It runs entirely on Cloudflare, separate from the app: one Worker (built by OpenNext), D1 for data, R2 for uploads, and Cloudflare's cache in front. Visitors and crawlers are answered at the edge and never reach the app's container or database.

## Run it locally

```bash
cp apps/site/.env.example apps/site/.env # fill PAYLOAD_SECRET and the SEED_ADMIN_* pair
pnpm -F @chipperly/site migrate          # creates the local D1 under apps/site/.wrangler/state
pnpm -F @chipperly/site seed             # first admin, categories, settings, 3 starter posts
pnpm -F @chipperly/site dev              # http://localhost:3100, admin at /admin
```

No database to install: wrangler runs a local D1 and R2. Local runs always use those local copies. The default bindings in `wrangler.jsonc` are local-only; the live D1/R2 are only reachable through its `remote` environment, which only the `deploy:*` scripts (and a deliberate live seed) select with `CLOUDFLARE_ENV=remote CLOUDFLARE_REMOTE_BINDINGS=1`.

Schema changes go through migrations, in dev too: after changing a collection or field, run `pnpm -F @chipperly/site payload migrate:create <name>`, then `pnpm -F @chipperly/site migrate`, and commit the file in `src/migrations/`. Run `generate:types` after schema or `wrangler.jsonc` changes, and `generate:importmap` after adding an admin component.

To run the real Worker locally (workerd, same runtime as Cloudflare): `pnpm -F @chipperly/site preview`. OpenNext does not build on Windows; there, use Docker:

```bash
docker run --rm -it -p 3100:3100 -v "<repo path>:/src:ro" node:22-bookworm bash /src/apps/site/scripts/cf-linux.sh preview
```

## Deploy to Cloudflare

Account: the owner's (`e576a82e9534f6dcf627eeaf15adf6d7`), zone `chipperlyapp.com`, Workers Paid plan (Payload's bundle is over the free plan's size limit). The app lives at `app.chipperlyapp.com` (`deploy/cloudflare/`); this site is a separate Worker, `chipperly-site`.

One-time setup, from `apps/site/`:

```bash
npx wrangler d1 create chipperly-site                 # paste the id into every REPLACE_WITH_D1_ID in wrangler.jsonc
npx wrangler r2 bucket create chipperly-site-media
npx wrangler r2 bucket create chipperly-site-cache
npx wrangler secret put PAYLOAD_SECRET                # openssl rand -hex 32
npx wrangler secret put CACHE_PURGE_API_TOKEN         # API token with Zone > Cache Purge on chipperlyapp.com
```

Then enable Images for next/image resizing (dashboard > Images; the binding is already in `wrangler.jsonc`).

**Deploy: GitHub > Actions > "Deploy site" > Run workflow.** It migrates the live D1, builds on Linux, deploys the site and mail Workers, and smoke-tests the live pages (repo secrets `CLOUDFLARE_API_TOKEN` and `PAYLOAD_SECRET`). To deploy by hand instead: Linux or WSL, or `scripts/cf-linux.sh deploy` in Docker on Windows. Set `NEXT_PUBLIC_SITE_URL=https://chipperlyapp.com` for the build, plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Use the dedicated "chipperly-site deploy" API token (Workers Scripts, D1, R2 edit, Account Settings read on the owner's account; Workers Routes on the zone), not a copied `wrangler login`: OAuth refresh tokens rotate and a shared copy gets the session revoked. The live values sit in the git-ignored `apps/site/.env.live`.

```bash
pnpm -F @chipperly/site deploy     # migrates the live D1, builds with live data, deploys the Worker
CLOUDFLARE_ENV=remote CLOUDFLARE_REMOTE_BINDINGS=1 pnpm -F @chipperly/site seed   # once, for the first admin
```

Pointing chipperlyapp.com at the Worker: uncomment `routes` in `wrangler.jsonc` and deploy again. Custom domains create the DNS records; the old site stops answering on those names at that moment.

### Passwords on Workers

Payload 3.90 hashes passwords with PBKDF2 at 600,000 iterations; production Workers cap PBKDF2 at 100,000, so logins fail there (local workerd does not enforce the cap). `patches/payload@3.90.2.patch` sets Payload to 100,000 everywhere. Re-check this patch whenever Payload is upgraded. To reset an editor's password or clear a lockout: `RESET_EMAIL=... RESET_PASSWORD=... pnpm -F @chipperly/site reset-admin` (add `CLOUDFLARE_ENV=remote CLOUDFLARE_REMOTE_BINDINGS=1` for live).

### Team email

`/admin` > Email addresses manages forwarding addresses at @chipperlyapp.com through Cloudflare Email Routing (`src/lib/emailRouting.ts`). Needs the `CLOUDFLARE_EMAIL_API_TOKEN` Worker secret (Email Routing Addresses edit on the account, Email Routing Rules edit on the zone). A new destination receives a Cloudflare verification email and must click it once; until then its address shows "Waiting for destination to verify" (open it and press Save after the click). "Also forward to" sends a copy to several people: the rule then hands mail to the `chipperly-mail` Email Worker (`mail-worker/`), which reads the recipients from D1.

### How caching works

- Static files (`/_next/static`, fonts) are served from the edge as immutable; screenshots and brand files for a day (`public/_headers`).
- Every page is pre-rendered or ISR. Rendered pages live in R2 with a copy in the nearest data centre's cache, and cache interception answers them before Next.js starts (`open-next.config.ts`).
- Saving in the admin calls `revalidatePath` for every URL the change touches (the page, lists, sitemap, RSS, llms files). OpenNext marks them stale in the D1 tag cache and purges exactly those URLs from Cloudflare's CDN. The next visitor gets the new version; everything else stays cached.
- Pages also refresh hourly in the background through a Durable Object queue, so no visitor waits on a rebuild.

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
- Microsoft Clarity (project `ynqc1d26iw`): set `CLARITY_ID` on the live server, or the field in Site settings. It records only on the live domain: never in dev, on localhost or a LAN IP, on any other host, or in `/admin` (`src/lib/clarity.ts`, tested). Clarity records sessions, so the privacy policy should mention it.
- Pages are static or cached (ISR, one hour) and refreshed as soon as an editor saves.

## Product screenshots

`public/screens/*.webp` come from the public demo: `node apps/site/scripts/capture-screens.mjs` (needs the demo login, see the script). Uploaded family photos are swapped for emoji before capture. The child view (`child-home.webp`) is taken from the e2e run instead.

## Environment

See `.env.example`. `NEXT_PUBLIC_SITE_URL` must be the real domain in production: canonicals, the sitemap and JSON-LD are built from it. `NEXT_PUBLIC_APP_URL` is where "Sign in" and "Try the app" go.
