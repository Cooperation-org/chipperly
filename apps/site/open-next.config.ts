import { defineCloudflareConfig } from '@opennextjs/cloudflare/config';
import { purgeCache } from '@opennextjs/cloudflare/overrides/cache-purge/index';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache';

// How pages are cached on Cloudflare:
// - Pre-rendered and ISR pages are stored in R2 (NEXT_INC_CACHE_R2_BUCKET),
//   with a copy in the Cache API of the data centre nearest the visitor
//   (regional cache, long-lived) so repeat hits never leave that location.
// - Cache interception answers a cached page before Next.js even starts.
// - revalidatePath() from the Payload save hooks marks paths stale in the D1
//   tag cache, and purgeCache({ type: 'direct' }) purges those URLs from the
//   Cloudflare CDN (needs CACHE_PURGE_ZONE_ID + CACHE_PURGE_API_TOKEN).
// - Hourly time-based revalidation runs in the background through a
//   Durable Object queue, so no visitor waits for a rebuild.
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),
  tagCache: d1NextTagCache,
  queue: doQueue,
  cachePurge: purgeCache({ type: 'direct' }),
  enableCacheInterception: true,
});
