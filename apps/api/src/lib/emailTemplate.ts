import { env } from '../env.js';

/** The public address of the app, used for links and the logo in every email that is not tied to one request. */
export const SITE_URL = 'https://app.chipperlyapp.com';

/** `APP_ORIGIN` when it is a real address; a local or missing one falls back to the live site so no email links to 127.0.0.1. */
export function siteOrigin(): string {
  const origin = env.APP_ORIGIN;
  if (!origin || /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(origin)) return SITE_URL;
  return `${origin}${env.BASE_PATH}`;
}

export interface EmailParts {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly action?: { readonly label: string; readonly url: string };
  /** Small print under the button, e.g. "This link expires in 7 days." */
  readonly note?: string;
}

const escapeHtml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TEAL = '#1f6f78';
const INK = '#2b2b2b';
const MUTED = '#6b6b6b';

/**
 * One branded template for every email. Table layout and inline styles on purpose:
 * mail clients ignore <style> blocks and modern CSS. Returns the plain-text twin too.
 */
export function renderEmail(parts: EmailParts): { text: string; html: string } {
  const { heading, paragraphs, action, note } = parts;
  const logo = `${siteOrigin()}/icons/icon-192.png`;
  const text = [
    heading,
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    ...(note ? [note] : []),
  ].join('\n\n');

  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${INK}">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:${TEAL};border-radius:8px"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:13px 24px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">${escapeHtml(action.label)}</a></td></tr></table>` +
      `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${MUTED}">Button not working? Copy this link into your browser:<br><a href="${escapeHtml(action.url)}" style="color:${TEAL};word-break:break-all">${escapeHtml(action.url)}</a></p>`
    : '';
  const small = note ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(note)}</p>` : '';

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:#faf8f4"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif">` +
    `<tr><td style="padding:0 4px 16px"><img src="${escapeHtml(logo)}" width="36" height="36" alt="" style="vertical-align:middle;border-radius:8px"> <span style="font-size:20px;font-weight:bold;color:${TEAL};vertical-align:middle;margin-left:6px">Chipperly</span></td></tr>` +
    `<tr><td style="background:#ffffff;border:1px solid #e2ddd3;border-radius:12px;padding:28px 28px 12px">` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${escapeHtml(heading)}</h1>${body}${button}${small}` +
    `</td></tr>` +
    `<tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:${MUTED}">Chipperly &middot; <a href="${escapeHtml(siteOrigin())}" style="color:${MUTED}">${escapeHtml(siteOrigin().replace(/^https?:\/\//, ''))}</a><br>You are getting this because of your Chipperly account.</td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { text, html };
}
