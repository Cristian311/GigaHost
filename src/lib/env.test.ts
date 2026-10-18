import { afterEach, describe, expect, it } from "vitest";
import { assertProductionEnv } from "./env";

/** A configuration that should pass every check. */
const VALID = {
  NODE_ENV: "production",
  AUTH_SECRET: "x".repeat(40),
  NEXT_PUBLIC_APP_URL: "https://gigahost.ro",
  PAYMENT_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  SERVER_PROVIDER: "pterodactyl",
  SMTP_URL: "smtp://user:pass@smtp.example.com:587",
  MAIL_FROM: "GigaHost <no-reply@gigahost.ro>",
  CRON_SECRET: "c".repeat(40),
  DATABASE_URL: "mysql://root@localhost:3306/gigahost",
} as const;

const original = { ...process.env };

/** Replaces the environment wholesale: a leftover value could hide a failure. */
function setEnv(overrides: Record<string, string | undefined>) {
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    if (value !== undefined) process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, original);
});

describe("assertProductionEnv", () => {
  it("accepts a fully configured production environment", () => {
    setEnv({});
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it("ignores development, where the defaults are the point", () => {
    setEnv({ NODE_ENV: "development", AUTH_SECRET: "change-me", SMTP_URL: undefined });
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it("does not run during `next build`, which has no runtime secrets", () => {
    setEnv({ NEXT_PHASE: "phase-production-build", AUTH_SECRET: undefined });
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it.each([
    ["a placeholder AUTH_SECRET", { AUTH_SECRET: "change-me-to-a-long-random-string" }, /AUTH_SECRET/],
    ["a short AUTH_SECRET", { AUTH_SECRET: "tooshort" }, /AUTH_SECRET/],
    ["an APP_URL on localhost", { NEXT_PUBLIC_APP_URL: "http://localhost:3000" }, /localhost/],
    ["a plain-http APP_URL", { NEXT_PUBLIC_APP_URL: "http://gigahost.ro" }, /https/],
    ["mock payments", { PAYMENT_PROVIDER: "mock" }, /PAYMENT_PROVIDER/],
    ["an unset PAYMENT_PROVIDER", { PAYMENT_PROVIDER: undefined }, /PAYMENT_PROVIDER/],
    ["Stripe without a key", { STRIPE_SECRET_KEY: undefined }, /STRIPE_SECRET_KEY/],
    ["Stripe without a webhook secret", { STRIPE_WEBHOOK_SECRET: undefined }, /STRIPE_WEBHOOK_SECRET/],
    ["mock provisioning", { SERVER_PROVIDER: "mock" }, /SERVER_PROVIDER/],
    ["no SMTP", { SMTP_URL: undefined }, /SMTP_URL/],
    ["no MAIL_FROM", { MAIL_FROM: undefined }, /MAIL_FROM/],
    ["no CRON_SECRET", { CRON_SECRET: undefined }, /CRON_SECRET/],
    ["a short CRON_SECRET", { CRON_SECRET: "short" }, /CRON_SECRET/],
    ["no DATABASE_URL", { DATABASE_URL: undefined }, /DATABASE_URL/],
  ])("refuses to start with %s", (_label, overrides, expected) => {
    setEnv(overrides);
    expect(() => assertProductionEnv()).toThrow(expected);
  });

  it("allows a mock provider only when it is opted into explicitly", () => {
    setEnv({ PAYMENT_PROVIDER: "mock", SERVER_PROVIDER: "mock" });
    expect(() => assertProductionEnv()).toThrow();

    setEnv({
      PAYMENT_PROVIDER: "mock",
      SERVER_PROVIDER: "mock",
      ALLOW_MOCK_PAYMENTS: "true",
      ALLOW_MOCK_PROVISIONING: "true",
    });
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it("reports every problem at once, rather than one per restart", () => {
    setEnv({ AUTH_SECRET: undefined, SMTP_URL: undefined, CRON_SECRET: undefined });
    expect(() => assertProductionEnv()).toThrow(/3 unsafe setting/);
  });

  it("can be skipped for a task that does not serve traffic", () => {
    setEnv({ SKIP_ENV_VALIDATION: "true", AUTH_SECRET: undefined, SMTP_URL: undefined });
    expect(() => assertProductionEnv()).not.toThrow();
  });
});
