import { env } from '../env.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/** Blanks the `token=` value in a reset/verify/invite link so the raw, unguessable token never reaches stdout/server logs. */
function redactTokens(text: string): string {
  return text.replace(/([?&]token=)[^\s&]+/gi, '$1<redacted>');
}

/** Prints a clear, copy-pasteable block to stdout. Used whenever RESEND_API_KEY is unset. */
function sendViaConsole(message: MailMessage): void {
  const lines = [
    '── mail (console transport) ──────────────────────────────',
    `to:      ${message.to}`,
    `from:    ${env.MAIL_FROM}`,
    `subject: ${message.subject}`,
    '',
    redactTokens(message.text),
    '───────────────────────────────────────────────────────────',
  ];
  console.log(lines.join('\n'));
}

async function sendViaResend(message: MailMessage): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? message.text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${body}`);
  }
}

let lastMessage: MailMessage | null = null;

/** Test hook: the most recent message passed to `sendMail`, whichever transport sent it. */
export function getLastMailMessage(): MailMessage | null {
  return lastMessage;
}

/**
 * Never throws: a Resend outage or a rejected recipient must not fail the
 * caller's request (register still creates the account; forgot-password
 * must return the same `{ ok: true }` whether or not the account exists,
 * sec: enumeration). The failure is still logged for operator visibility.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  lastMessage = message;
  if (env.mailEnabled) {
    try {
      await sendViaResend(message);
    } catch (err) {
      console.error('sendMail: Resend send failed', err);
    }
    return;
  }
  sendViaConsole(message);
}
