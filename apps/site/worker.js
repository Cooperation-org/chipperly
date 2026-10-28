// Wraps the OpenNext-generated worker (built into .open-next/ by the deploy)
// to add a cron handler: wrangler.jsonc's daily trigger lands here, and
// running Payload's job queue is what makes "Schedule Publish" on a blog
// post actually publish it at (well, after) the chosen time, and sending the
// newsletters scheduled in /admin. The Durable
// Object classes are re-exported because wrangler resolves them from `main`.
import handler from './.open-next/worker.js';

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';

// The dev copy (dev.chipperlyapp.com, wrangler env "dev") sets the DEV_GATE secret to "user:password":
// every page then asks for it and nothing is indexed. /api/ stays open, as on dev-app: callers there
// bring their own credentials. Live has no DEV_GATE, so this does nothing there.
function devGate(request, env) {
  if (!env.DEV_GATE || new URL(request.url).pathname.startsWith('/api/')) return null;
  if (request.headers.get('authorization') === `Basic ${btoa(env.DEV_GATE)}`) return null;
  return new Response('This is the Chipperly dev site.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Chipperly dev"', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

const worker = {
  async fetch(request, env, ctx) {
    if (!env.DEV_GATE) return handler.fetch(request, env, ctx);
    const denied = devGate(request, env);
    if (denied) return denied;
    const upstream = await handler.fetch(request, env, ctx);
    const res = new Response(upstream.body, upstream);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch('https://chipperlyapp.com/api/payload-jobs/run?limit=10', {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }).then(async (res) =>
        console.log(JSON.stringify({ msg: 'payload-jobs run', status: res.status, body: (await res.text()).slice(0, 200) })),
      ),
    );
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch('https://chipperlyapp.com/api/newsletters/send-due', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }).then(async (res) =>
        console.log(JSON.stringify({ msg: 'newsletters send-due', status: res.status, body: (await res.text()).slice(0, 200) })),
      ),
    );
  },
};

export default worker;
