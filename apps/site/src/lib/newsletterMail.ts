import { CONTACT_EMAIL, SITE_URL } from './site';
import { unsubscribeToken } from './unsubscribe';

export type Mail = { to: string; subject: string; text: string; html: string; headers: Record<string, string> };

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Blank line = new paragraph, single newline = line break, links clickable.
// Same rules as the app's mail (apps/api/src/lib/mailer.ts).
function toHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** One recipient's copy: the body, an unsubscribe footer with their own signed link, and the List-Unsubscribe headers. */
export async function buildMail(o: { to: string; subject: string; body: string; secret: string; siteUrl?: string }): Promise<Mail> {
  const link = `${o.siteUrl ?? SITE_URL}/unsubscribe?t=${await unsubscribeToken(o.to, o.secret)}`;
  const foot = `You get this because you signed up at chipperlyapp.com. Unsubscribe: ${link}`;
  return {
    to: o.to,
    subject: o.subject,
    text: `${o.body}\n\n--\n${foot}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#2b2b2b">${toHtml(o.body)}<hr><p style="font-size:13px;color:#666">You get this because you signed up at chipperlyapp.com. <a href="${link}">Unsubscribe</a></p></div>`,
    headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Resend's batch endpoint takes up to 100 messages per call. Never throws: a refused batch counts as failed. */
export async function sendBatch(mails: Mail[], o: { apiKey: string; from: string }, fetchImpl: typeof fetch = fetch) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    try {
      const res = await fetchImpl('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
        // Newsletters come from no-reply, so a reply goes to the inbox someone reads.
        body: JSON.stringify(chunk.map((m) => ({ from: o.from, reply_to: CONTACT_EMAIL, ...m }))),
      });
      if (res.ok) sent += chunk.length;
      else throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      failed += chunk.length;
      console.error(JSON.stringify({ msg: 'newsletter batch failed', err: String(err) }));
    }
  }
  return { sent, failed };
}
