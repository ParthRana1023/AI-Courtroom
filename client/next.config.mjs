import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import withSerwistInit from "@serwist/next";

const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Revision for the offline fallback precache entry – based on the current
// git commit so that the cached page is updated on each deploy.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const isDev = process.env.NODE_ENV === "development";

// React's dev tooling needs eval and the local API; production builds need neither.
const devScriptSrc = isDev ? " 'unsafe-eval'" : "";
const devConnectSrc = isDev ? " http://localhost:8000" : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devScriptSrc} https://accounts.google.com https://*.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${devConnectSrc} ${apiOrigin} https://accounts.google.com https://*.vercel-insights.com https://*.vercel-analytics.com`,
  "frame-src https://accounts.google.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  // A reload on reconnect would discard unsent drafts; the offline banner handles reconnecting.
  reloadOnOnline: false,
  // Disable SW in dev mode and Capacitor native builds.
  // Test PWA features via: pnpm build && pnpm start
  disable: isDev || isCapacitorBuild,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  allowedDevOrigins: ["192.168.29.33", "localhost", "127.0.0.1"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Content-Type",
            value: "application/xml",
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          {
            key: "Content-Type",
            value: "text/plain",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
