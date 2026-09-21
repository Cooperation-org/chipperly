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

export interface DataMessage {
  readonly tokens: readonly string[];
  readonly data: Record<string, string>;
}

/**
 * A silent, data-only push -- no `notification` field, so nothing shows in
 * the system tray. Used for the locate-request flow (routes/me.ts): FCM only
 * *guarantees* delivery to a killed app's onMessageReceived for a pure data
 * message; a `notification` payload is handled by the OS tray directly when
 * the app isn't foregrounded and may never reach app code at all.
 */
async function sendDataViaFirebase(message: DataMessage): Promise<string[]> {
  if (message.tokens.length === 0) return [];
  const { getMessaging } = await import('firebase-admin/messaging');
  const response = await getMessaging(await firebaseApp()).sendEachForMulticast({
    tokens: [...message.tokens],
    data: message.data,
    android: { priority: 'high' },
  });

  const stale: string[] = [];
  response.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      stale.push(message.tokens[i]!);
    } else {
      console.error('sendDataMessage: Firebase send failed for one token', r.error);
    }
  });
  return stale;
}

/** Never throws. Returns false when push is unconfigured (console-fallback has nothing useful to do with a data-only message, unlike sendPush). */
export async function sendDataMessage(message: DataMessage): Promise<boolean> {
  if (!env.pushEnabled) {
    console.log(`── push (console transport) ── data message, ${message.tokens.length} token(s): ${JSON.stringify(message.data)}`);
    return false;
  }
  try {
    await sendDataViaFirebase(message);
    return true;
  } catch (err) {
    console.error('sendDataMessage: Firebase send failed', err);
    return false;
  }
}
