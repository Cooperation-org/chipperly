// chipperly-mail: Cloudflare Email Worker for @chipperlyapp.com addresses
// that go to more than one person (e.g. info@ to the founder and support).
// Email Routing rules forward to a single inbox, so those addresses send the
// message here instead (set automatically by /admin > Email addresses when
// "Also forward to" has entries). Recipients are read from the site's D1, so
// /admin stays the one place to manage them.
import { pickRecipients, pickRow } from './recipients';

interface Env {
  DB: D1Database;
}

type AddressRow = { id: number; local_part: string; destination: string; enabled: number | null };

const worker = {
  async email(message: ForwardableEmailMessage, env: Env) {
    const localPart = message.to.split('@')[0] ?? '';
    const { results } = await env.DB.prepare(
      "SELECT id, local_part, destination, enabled FROM email_addresses WHERE local_part IN (?, '*')",
    )
      .bind(localPart.toLowerCase())
      .all<AddressRow>();
    const row = pickRow(results, localPart);
    if (!row) {
      message.setReject('Address not found');
      return;
    }
    const extras = await env.DB.prepare('SELECT email FROM email_addresses_also_forward_to WHERE _parent_id = ? ORDER BY _order')
      .bind(row.id)
      .all<{ email: string }>();
    const to = pickRecipients(row.destination, extras.results.map((e) => e.email));
    const sent = await Promise.allSettled(to.map((addr) => message.forward(addr)));
    sent.forEach((r, i) => {
      if (r.status === 'rejected') console.error(JSON.stringify({ msg: 'forward failed', to: to[i], err: String(r.reason) }));
    });
    // Bounce only if nobody got it, so the sender knows.
    if (sent.every((r) => r.status === 'rejected')) message.setReject('Could not deliver this message');
  },
};

export default worker;
