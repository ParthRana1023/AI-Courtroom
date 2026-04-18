import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type CapacitorConfig = {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    url?: string;
    cleartext?: boolean;
    androidScheme?: string;
  };
  plugins?: Record<string, unknown>;
};

function readEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return {};
  }

  const envFile = readFileSync(envPath, "utf8");
  const envEntries = envFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return null;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      return [key, value] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  return Object.fromEntries(envEntries);
}

const env = readEnvFile();

const googleServerClientId =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
  env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
  "";
const capacitorServerUrl =
  process.env.CAP_SERVER_URL ??
  env.CAP_SERVER_URL ??
  "https://ai-courtroom.vercel.app";
const isHttpDevServer = capacitorServerUrl.startsWith("http://");

type ExtendedCapacitorConfig = CapacitorConfig & {
  plugins?: NonNullable<CapacitorConfig["plugins"]> & {
    GoogleSignIn?: {
      serverClientId: string;
    };
  };
};

const config: ExtendedCapacitorConfig = {
  appId: "com.aicourtroom.app",
  appName: "AI Courtroom",
  // webDir is required by Capacitor even in server mode.
  // It contains a minimal fallback page shown if the server is unreachable.
  webDir: "public",
  server: {
    // The native app loads from the hosted deployment.
    // This avoids the need for static export (which is incompatible with
    // our dynamic routes like /dashboard/cases/[cnr]).
    url: capacitorServerUrl,
    cleartext: isHttpDevServer,
    // Clear the server URL when building for production release,
    // or point to your local dev server IP for live-reload during development:
    // url: 'http://192.168.x.x:3000',
    androidScheme: isHttpDevServer ? "http" : "https",
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
      backgroundColor: "#0f172a",
    },
  },
};

export default config;
