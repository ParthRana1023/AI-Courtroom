import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aicourtroom.app',
  appName: 'AI Courtroom',
  webDir: 'out',
  server: {
    // In production, the app loads from the bundled static files.
    // For live-reload during development, uncomment the url below
    // and point it to your local dev server's IP address:
    // url: 'http://192.168.x.x:3000',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
