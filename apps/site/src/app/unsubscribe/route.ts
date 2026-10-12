import { payload } from '../../lib/payload';
import { readUnsubscribeToken } from '../../lib/unsubscribe';

// The link in every newsletter. GET shows one button (so a mail scanner that
// opens the link does not unsubscribe anyone); POST does it. Mail apps' own
// "Unsubscribe" button POSTs here too (List-Unsubscribe-Post).
const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1>${title}</h1>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

const bad = () => page('This link does not work', '<p>It may have been cut short. Reply to any of our emails and we will remove you by hand.</p>', 400);

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  const email = await readUnsubscribeToken(t, process.env.PAYLOAD_SECRET ?? '');
  if (!email) return bad();
  return page(
    'Unsubscribe',
    `<p>Stop emails from Chipperly to ${email.replace(/[<>&"]/g, '')}?</p><form method="post" action="?t=${encodeURIComponent(t)}"><button style="font:inherit;padding:.6rem 1.2rem">Unsubscribe</button></form>`,
  );
}

export async function POST(req: Request) {
  const email = await readUnsubscribeToken(new URL(req.url).searchParams.get('t') ?? '', process.env.PAYLOAD_SECRET ?? '');
  if (!email) return bad();
  const p = await payload();
  const known = await p.count({ collection: 'unsubscribes', where: { email: { equals: email } }, overrideAccess: true });
  if (!known.totalDocs) await p.create({ collection: 'unsubscribes', data: { email, source: 'link' }, overrideAccess: true });
  return page('You are unsubscribed', '<p>You will not get any more emails from us. Sorry to see you go.</p>');
}
