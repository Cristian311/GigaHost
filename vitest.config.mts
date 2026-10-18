import path from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/setup/env.mts";

const alias = { "@": path.resolve(import.meta.dirname, "./src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/setup/global.ts"],
          // The suites share one database, so they must not run concurrently.
          fileParallelism: false,
          env: {
            DATABASE_URL: TEST_DATABASE_URL,
            SERVER_PROVIDER: "mock",
            AUTH_SECRET: "test-secret-value-for-integration-tests",
            NEXT_PUBLIC_APP_URL: "https://gigahost.test",
            // Behind one reverse proxy, as a real deployment is. Without this
            // the app ignores X-Forwarded-For entirely (see clientIp) and the
            // per-address limits would all share one bucket.
            TRUSTED_PROXY_HOPS: "1",
          },
          testTimeout: 20_000,
        },
      },
    ],
  },
});
