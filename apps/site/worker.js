// Wraps the OpenNext-generated worker (built into .open-next/ by the deploy)
// to add a cron handler: wrangler.jsonc's daily trigger lands here, and
// running Payload's job queue is what makes "Schedule Publish" on a blog
// post actually publish it at (well, after) the chosen time. The Durable
// Object classes are re-exported because wrangler resolves them from `main`.
import handler from './.open-next/worker.js';

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';

const worker = {
  fetch: (request, env, ctx) => handler.fetch(request, env, ctx),
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch('https://chipperlyapp.com/api/payload-jobs/run?limit=10', {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }).then(async (res) =>
        console.log(JSON.stringify({ msg: 'payload-jobs run', status: res.status, body: (await res.text()).slice(0, 200) })),
      ),
    );
  },
};

export default worker;
