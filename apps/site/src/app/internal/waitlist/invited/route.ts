import { fromApp } from '../../../../lib/appSecret';
import { payload } from '../../../../lib/payload';

// POST { emails }: the admin site emailed these people the beta code; stamp them.
export async function POST(req: Request) {
  if (!fromApp(req)) return new Response('Not found', { status: 404 });
  const body = (await req.json().catch(() => null)) as { emails?: unknown } | null;
  const emails = Array.isArray(body?.emails) ? body.emails.filter((e): e is string => typeof e === 'string').slice(0, 500) : [];
  if (emails.length === 0) return Response.json({ ok: false }, { status: 400 });
  const p = await payload();
  await p.update({
    collection: 'waitlist',
    where: { email: { in: emails.map((e) => e.toLowerCase()) } },
    data: { invitedAt: new Date().toISOString() },
    overrideAccess: true,
  });
  return Response.json({ ok: true });
}
