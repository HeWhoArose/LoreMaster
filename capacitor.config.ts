import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.openworld.rpg',
  appName: 'LoreMaster',
  webDir: 'games/openworld/client/dist',
  // Open the LoreMaster shell (shell.html) rather than the legacy OpenWorld title page (index.html).
  // `server.appStartPath` is the supported way to start from another page (Capacitor 7.3+); `server.url` is
  // only for live reload against a dev server, and `startUrl` is not a Capacitor config key at all.
  server: { appStartPath: 'shell.html' }
};

export default config;
