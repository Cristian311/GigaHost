import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Headers that cannot change how a page renders. A full CSP (script-src,
 * style-src) is deliberately not here: Next.js needs per-request nonces for its
 * inline bootstrap, so adding one without testing every page would break the
 * app. `frame-ancestors` is the part worth having now — the panel has
 * destructive buttons and must not be framed.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only meaningful over https, and browsers ignore it on http://localhost.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "mariadb"],
  // Allow opening the dev server from other devices on the LAN (e.g. http://192.168.1.22:3000).
  // Without this Next.js returns 403 for dev assets requested from a non-localhost origin.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
