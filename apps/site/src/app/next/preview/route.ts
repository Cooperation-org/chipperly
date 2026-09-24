import config from '@payload-config';
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPayload } from 'payload';
import { getSafeRedirect } from 'payload/shared';

// The admin's Preview button lands here. Only a signed-in editor gets draft
// mode; everyone else is refused.
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path');
  const safePath = path ? getSafeRedirect({ redirectTo: path, fallbackTo: '' }) : '';
  if (!safePath) return new Response('Missing or unsafe path', { status: 400 });

  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  const draft = await draftMode();
  if (!user) {
    draft.disable();
    return new Response('Sign in to the admin to preview drafts.', { status: 403 });
  }
  draft.enable();
  redirect(safePath);
}
