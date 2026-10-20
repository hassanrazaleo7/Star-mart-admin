import type { NextConfig } from "next";

// Static headers for every response (including static assets). The Content-Security-Policy
// is set in src/proxy.ts because it needs a fresh nonce per request.
const staticSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera is allowed for the panel's own origin (barcode scanning); everything else stays off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Every admin page is rendered per request (nonce-based CSP + session checks),
  // so Cache Components / partial prefetching are intentionally left off.
  serverExternalPackages: ["bwip-js", "@react-pdf/renderer"],
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // CSV imports
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: staticSecurityHeaders }];
  },
};

export default nextConfig;
