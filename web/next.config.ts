import type { NextConfig } from "next";

// In production the browser talks only to the web origin: these backend paths
// are proxied to the NestJS service, so the `mittus_session` cookie (SameSite=Lax)
// is first-party for both the backend and the Next.js route handlers that read it.
// Set BACKEND_URL (e.g. https://mittus-backend.discloud.app) together with
// NEXT_PUBLIC_API_URL="/" to enable it. Unset in local dev: nothing changes.
const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");
const BACKEND_PATHS = ["/api/check-ins/:path*", "/api/check-in-options", "/api/check-in-actions/:path*"];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    if (!backendUrl) return [];
    return BACKEND_PATHS.map((source) => ({ source, destination: `${backendUrl}${source}` }));
  },
};

export default nextConfig;
