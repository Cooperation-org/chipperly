# Cloudflare deploy

`app.chipperlyapp.com` is one Worker. It serves the web export as static
assets and sends `/api/*` to a single Cloudflare Container running the
unchanged Fastify API. Postgres is on Neon's free tier. Media is in R2, served
from `media.chipperlyapp.com`.

The container sleeps after 5 idle minutes. An hourly cron wakes it to send
routine reminders (`POST /api/internal/reminders`, guarded by `CRON_SECRET`).
Before sleeping it asks `/api/internal/busy`, so a video transcode is never cut
off. The Worker 404s `/api/internal/*` from the internet.

Account: Tamar.pixley@gmail.com's Account (`e576a82e9534f6dcf627eeaf15adf6d7`),
zone `chipperlyapp.com`.

## One-time setup

The account owner does these (they need billing access):

1. Workers Paid plan ($5/month). Containers need it.
2. Enable R2 (asks for a payment method; the first 10 GB are free).

Then, from this folder:

```sh
npx wrangler r2 bucket create chipperly-media
npx wrangler r2 bucket domain add chipperly-media --domain media.chipperlyapp.com --zone-id 9f961107ff719cdefb274757754dd8cc
# R2 API token (Object Read & Write on chipperly-media): dashboard > R2 > Manage API tokens

npx wrangler secret put DATABASE_URL          # Neon pooled connection string, sslmode=require
npx wrangler secret put JWT_SECRET            # openssl rand -base64 48
npx wrangler secret put CRON_SECRET           # openssl rand -base64 48
npx wrangler secret put S3_ENDPOINT           # https://e576a82e9534f6dcf627eeaf15adf6d7.r2.cloudflarestorage.com
npx wrangler secret put S3_BUCKET             # chipperly-media
npx wrangler secret put S3_ACCESS_KEY_ID
npx wrangler secret put S3_SECRET_ACCESS_KEY
# optional: BETA_INVITE_CODE, RESEND_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON,
# VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, GOOGLE_OAUTH_CLIENT_ID, SUPER_ADMIN_EMAILS
```

## Deploy

Docker must be running. Wrangler builds and pushes the image.

```sh
# from the repo root
pnpm install
pnpm -F @chipperly/shared build
NEXT_PUBLIC_BASE_PATH= NEXT_PUBLIC_API_ORIGIN= NEXT_PUBLIC_SITE_ORIGIN=https://app.chipperlyapp.com \
  pnpm -F @chipperly/web build
cd deploy/cloudflare && npm install && npx wrangler deploy
```

Migrations run on every container boot (`dist/db/migrate.js`), and Drizzle
skips the ones already applied.

## Cost

$5/month plan, plus about $0.0025 per GiB-hour the container is awake past
the 25 GiB-hours included. The hourly cron alone is about 60 hours a month
(roughly $0.30). An open app syncs every 60 seconds and keeps it awake, so
real use sets the rest: awake all month is about $6 more. Neon free: 0.5 GB.
R2 free: 10 GB.
