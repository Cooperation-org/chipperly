import { fromApp } from '../../../lib/appSecret';
import { payload } from '../../../lib/payload';

// GET: every waitlist entry, for the admin site's Waitlist page. Same 404 as an unknown page without the secret.
export async function GET(req: Request) {
  if (!fromApp(req)) return new Response('Not found', { status: 404 });
  const p = await payload();
  const { docs } = await p.find({ collection: 'waitlist', pagination: false, depth: 0, sort: '-createdAt', overrideAccess: true });
  return Response.json(
    {
      entries: docs.map((d) => ({
        email: d.email,
        name: d.name ?? null,
        role: d.role ?? null,
        source: d.source ?? null,
        created_at: Date.parse(d.createdAt),
        invited_at: d.invitedAt ? Date.parse(d.invitedAt) : null,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
