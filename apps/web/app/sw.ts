// Serwist service worker source (technical-plan.md "PWA"). Bundled by
// @serwist/next's webpack plugin into public/sw.js at build time.
//
// This file is typechecked under the app's normal "dom" tsconfig lib, not
// "webworker" (the two declare incompatible `self` types and can't both be
// included). `skipLibCheck` in tsconfig.base.json is what lets serwist's own
// .d.ts files reference webworker-only globals like `ExtendableEvent`
// without that leaking into this file; this file itself never names those
// globals directly, so it typechecks clean either way.
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist';
import type { PrecacheEntry, RuntimeCaching } from 'serwist';

// @serwist/webpack-plugin's InjectManifest finds its injection point by
// scanning the compiled source text for the literal `self.__SW_MANIFEST`
// (see its `injectionPoint` option); a renamed local alias for `self` would
// compile to a different property access and the plugin would fail with
// "Can't find self.__SW_MANIFEST in your SW source." So this references
// `self` directly, declared once via `declare const`.
declare const self: typeof globalThis & {
  __SW_MANIFEST?: (PrecacheEntry | string)[];
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Order matters: the more specific /api/media/ rule must come before the
// catch-all /api/ rule.
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url }) => url.pathname.includes('/api/media/'),
    handler: new CacheFirst({
      cacheName: 'media',
      plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: ONE_YEAR_SECONDS })],
    }),
  },
  {
    matcher: ({ url }) => url.pathname.includes('/api/'),
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { ignoreURLParametersMatching: [/.*/] },
  // A new version takes over as soon as it's installed. With `false` it
  // waited for every tab to close, which iOS Safari almost never does, so
  // phones kept serving an old cached build indefinitely.
  // SwRegister reloads the page once the new worker is in control.
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching,
});

serwist.addEventListeners();

// Web Push from the API (apps/api/src/lib/push.ts sendWebPush), e.g. "Celia
// wants a reward". Loose local types: this file is checked against the DOM
// lib, which has no service-worker event types (see the note at the top).
interface WindowClientLike {
  focus(): Promise<unknown>;
  navigate(url: string): Promise<WindowClientLike | null>;
}
interface WorkerScope {
  registration: ServiceWorkerRegistration;
  clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: 'push' | 'notificationclick', listener: (event: WorkerEvent) => void): void;
}
interface WorkerEvent {
  data?: { json(): unknown } | null;
  notification?: Notification;
  waitUntil(promise: Promise<unknown>): void;
}
const scope = self as unknown as WorkerScope;

scope.addEventListener('push', (event) => {
  const data = (event.data?.json() ?? {}) as { title?: string; body?: string; type?: string; path?: string };
  event.waitUntil(
    scope.registration.showNotification(data.title ?? 'Chipperly', {
      body: data.body,
      icon: 'icons/icon-192.png',
      tag: `${data.type ?? 'chipperly'}-${Date.now()}`,
      // A reward request waits on screen until the caregiver sees it.
      requireInteraction: data.type === 'reward_request',
      data: { path: data.path ?? '' },
    }),
  );
});

scope.addEventListener('notificationclick', (event) => {
  event.notification?.close();
  // e.g. "chips/?profile=..." for a reward request, relative to the app's own scope.
  const url = scope.registration.scope + ((event.notification?.data as { path?: string } | undefined)?.path ?? '');
  event.waitUntil(
    scope.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) =>
      windows[0] ? windows[0].navigate(url).then((w) => (w ?? windows[0]!).focus()) : scope.clients.openWindow(url),
    ),
  );
});
