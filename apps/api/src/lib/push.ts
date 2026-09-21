import type { App, ServiceAccount } from 'firebase-admin/app';
import { env } from '../env.js';

export interface PushMessage {
  readonly tokens: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, string>;
}

/** Prints a clear block to stdout. Used whenever FIREBASE_SERVICE_ACCOUNT_JSON is unset. */
function sendViaConsole(message: PushMessage): void {
  const lines = [
    '── push (console transport) ──────────────────────────────',
    `tokens:  ${message.tokens.length}`,
    `title:   ${message.title}`,
    `body:    ${message.body}`,
    '───────────────────────────────────────────────────────────',
  ];
  console.log(lines.join('\n'));
}

let cachedApp: App | undefined;

async function firebaseApp(): Promise<App> {
  if (cachedApp) return cachedApp;
  const { initializeApp, cert } = await import('firebase-admin/app');
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON!) as ServiceAccount;
  cachedApp = initializeApp({ credential: cert(serviceAccount) });
  return cachedApp;
}

/** Returns the tokens FCM reported as invalid/unregistered, so the caller can delete those push_tokens rows. */
async function sendViaFirebase(message: PushMessage): Promise<string[]> {
  if (message.tokens.length === 0) return [];
  const { getMessaging } = await import('firebase-admin/messaging');
  const response = await getMessaging(await firebaseApp()).sendEachForMulticast({
    tokens: [...message.tokens],
    notification: { title: message.title, body: message.body },
    data: message.data,
  });

  const stale: string[] = [];
  response.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      stale.push(message.tokens[i]!);
    } else {
      console.error('sendPush: Firebase send failed for one token', r.error);
    }
  });
  return stale;
}

/** Never throws: a Firebase outage must not fail the caller (e.g. a location-change request). Returns stale tokens to clean up, [] on any failure or when push is unconfigured. */
export async function sendPush(message: PushMessage): Promise<string[]> {
  if (!env.pushEnabled) {
    sendViaConsole(message);
    return [];
  }
  try {
    return await sendViaFirebase(message);
  } catch (err) {
    console.error('sendPush: Firebase send failed', err);
    return [];
  }
}
