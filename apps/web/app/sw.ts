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
