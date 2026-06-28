import type { NextConfig } from "next";

/**
 * Baseline security headers applied to every response. We intentionally avoid
 * a strict Content-Security-Policy here (Next.js inlines runtime scripts and
 * styles; a nonce-based CSP needs middleware wiring) and instead ship the
 * high-value, low-risk headers. Tighten to a nonce CSP as a follow-up.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * Allow the dev server's `_next/*` resources (JS chunks, HMR, CSS) to be
   * fetched cross-origin when testing on a real device over the LAN. Without
   * this, Next 16 blocks those requests by default, so the page loads with no
   * client JS / styles and the glass nav bar never renders. Add your machine's
   * LAN IP here (run `ipconfig getifaddr en0`); update it if your network/IP
   * changes (e.g. a different Wi-Fi or hotspot).
   */
  allowedDevOrigins: ["172.20.10.6", "localhost", "127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
