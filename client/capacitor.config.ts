import type { CapacitorConfig } from '@capacitor/cli';

const googleServerClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

type ExtendedCapacitorConfig = CapacitorConfig & {
  plugins?: NonNullable<CapacitorConfig['plugins']> & {
    GoogleSignIn?: {
      serverClientId: string;
    };
  };
};

const config: ExtendedCapacitorConfig = {
  appId: 'com.aicourtroom.app',
  appName: 'AI Courtroom',
  // webDir is required by Capacitor even in server mode.
  // It contains a minimal fallback page shown if the server is unreachable.
  webDir: 'public',
  server: {
    // The native app loads from the hosted deployment.
    // This avoids the need for static export (which is incompatible with
    // our dynamic routes like /dashboard/cases/[cnr]).
    url: 'https://ai-courtroom.vercel.app',
    // Clear the server URL when building for production release,
    // or point to your local dev server IP for live-reload during development:
    // url: 'http://192.168.x.x:3000',
    androidScheme: 'https',
  },
  plugins: {
    // The native Google Sign-In flow uses the web client ID as the server client ID.
    // The login component also initializes the plugin at runtime with the same value.
    GoogleSignIn: {
      serverClientId: googleServerClientId,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
