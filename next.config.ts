import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "better-sqlite3"],
  // Allow opening the dev server from other devices on the LAN (e.g. http://192.168.1.22:3000).
  // Without this Next.js returns 403 for dev assets requested from a non-localhost origin.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};

export default withNextIntl(nextConfig);
