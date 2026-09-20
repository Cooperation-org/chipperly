import type { CapacitorConfig } from '@capacitor/cli';

// ponytail: appId is a placeholder (org.chipperly.app) until a real bundle
// id is picked — rename here + `npx cap sync` before any store submission,
// changing it after listings exist is much more painful.
const config: CapacitorConfig = {
  appId: 'org.chipperly.app',
  appName: 'Chipperly',
  webDir: 'out',
};

export default config;
