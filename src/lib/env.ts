import { z } from "zod";

export type ServerProviderKind = "mock" | "pterodactyl";

export function getServerProviderKind(): ServerProviderKind {
  return (process.env.SERVER_PROVIDER ?? "mock").toLowerCase() === "pterodactyl"
    ? "pterodactyl"
    : "mock";
}

const pterodactylEnvSchema = z.object({
  PTERODACTYL_URL: z.url(),
  PTERODACTYL_APP_KEY: z.string().startsWith("ptla_"),
  PTERODACTYL_CLIENT_KEY: z.string().startsWith("ptlc_"),
  PTERODACTYL_OWNER_USER_ID: z.coerce.number().int().positive(),
});

export type PterodactylConfig = {
  url: string;
  appKey: string;
  clientKey: string;
  /** Panel user that owns every server created by GigaHost (Phase 1). */
  ownerUserId: number;
};

let cached: PterodactylConfig | undefined;

/** Validated Pterodactyl settings; throws a readable error listing what is wrong. */
export function getPterodactylConfig(): PterodactylConfig {
  if (cached) return cached;
  const parsed = pterodactylEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(
      `SERVER_PROVIDER=pterodactyl, but these variables are missing or invalid: ${fields.join(", ")}. ` +
        "See infra/pterodactyl/README.md.",
    );
  }
  const env = parsed.data;
  cached = {
    url: env.PTERODACTYL_URL.replace(/\/+$/, ""),
    appKey: env.PTERODACTYL_APP_KEY,
    clientKey: env.PTERODACTYL_CLIENT_KEY,
    ownerUserId: env.PTERODACTYL_OWNER_USER_ID,
  };
  return cached;
}

/** Called once at server start so a broken provider config fails loudly. */
export function assertProviderConfig(): void {
  if (getServerProviderKind() === "pterodactyl") getPterodactylConfig();
}

/** Opt-outs for the two mock providers, so shipping them is a decision, not an accident. */
const MOCK_PAYMENTS_OPT_OUT = "ALLOW_MOCK_PAYMENTS";
const MOCK_PROVISIONING_OPT_OUT = "ALLOW_MOCK_PROVISIONING";

/**
 * NEXT_PUBLIC_* values are substituted into the bundle by `next build`, so the
 * one being checked here is the one baked in — setting it in the runtime
 * environment changes nothing until the app is rebuilt.
 */
const INLINED_AT_BUILD =
  "It is inlined at build time, so setting it at runtime has no effect: set it and rebuild.";

function isSet(name: string): boolean {
  return (process.env[name] ?? "").trim().length > 0;
}

function allows(name: string): boolean {
  return (process.env[name] ?? "").toLowerCase() === "true";
}

/**
 * Every way this app can boot into a state that looks fine but quietly loses
 * money or leaks accounts. Each entry is a problem only when the check fails.
 */
function productionProblems(): string[] {
  const problems: string[] = [];

  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret.trim()) {
    problems.push("AUTH_SECRET is not set: session cookies cannot be signed.");
  } else if (secret.length < 32 || /change[-_ ]?me/i.test(secret)) {
    problems.push(
      "AUTH_SECRET is the placeholder or shorter than 32 characters: sessions could be forged. " +
        "Generate one with `npx auth secret`.",
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl.trim()) {
    problems.push(
      "NEXT_PUBLIC_APP_URL is not set: emails, the sitemap and gateway redirects would point at " +
        `http://localhost:3000. ${INLINED_AT_BUILD}`,
    );
  } else if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(appUrl)) {
    problems.push(
      `NEXT_PUBLIC_APP_URL still points at localhost (${appUrl}). ${INLINED_AT_BUILD}`,
    );
  } else if (!appUrl.startsWith("https://")) {
    problems.push(`NEXT_PUBLIC_APP_URL should be https in production (${appUrl}). ${INLINED_AT_BUILD}`);
  }

  if ((process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase() !== "stripe") {
    if (!allows(MOCK_PAYMENTS_OPT_OUT)) {
      problems.push(
        "PAYMENT_PROVIDER is not \"stripe\": every order would be marked paid without charging " +
          `anything. Set PAYMENT_PROVIDER=stripe, or ${MOCK_PAYMENTS_OPT_OUT}=true to give servers away.`,
      );
    }
  } else {
    if (!isSet("STRIPE_SECRET_KEY")) problems.push("PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY.");
    if (!isSet("STRIPE_WEBHOOK_SECRET")) {
      problems.push(
        "PAYMENT_PROVIDER=stripe needs STRIPE_WEBHOOK_SECRET: without it the webhook rejects every " +
          "event and paid orders are never fulfilled.",
      );
    }
  }

  if (getServerProviderKind() !== "pterodactyl" && !allows(MOCK_PROVISIONING_OPT_OUT)) {
    problems.push(
      "SERVER_PROVIDER is not \"pterodactyl\": customers would be sold simulated servers. " +
        `Set SERVER_PROVIDER=pterodactyl, or ${MOCK_PROVISIONING_OPT_OUT}=true if that is intended.`,
    );
  }

  if (!isSet("SMTP_URL")) {
    problems.push(
      "SMTP_URL is not set: verification, password-reset and billing emails would be written to " +
        "the outbox and never delivered.",
    );
  }
  if (!isSet("MAIL_FROM")) {
    problems.push("MAIL_FROM is not set: emails would be sent from no-reply@localhost.");
  }

  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret.trim()) {
    problems.push(
      "CRON_SECRET is not set: /api/cron/* stays closed, so renewals, suspensions and scheduled " +
        "tasks would never run.",
    );
  } else if (cronSecret.length < 32) {
    problems.push("CRON_SECRET is shorter than 32 characters; generate one with `openssl rand -hex 32`.");
  }

  if (!isSet("DATABASE_URL")) problems.push("DATABASE_URL is not set.");

  return problems;
}

/**
 * Refuses to start a production server whose configuration would silently cost
 * money or hand out accounts. Skipped during `next build` (the build has no
 * runtime secrets) and by SKIP_ENV_VALIDATION=true for one-off tasks such as a
 * migration container.
 */
export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (allows("SKIP_ENV_VALIDATION")) return;

  const problems = productionProblems();
  if (problems.length === 0) return;

  throw new Error(
    `Refusing to start: ${problems.length} unsafe setting(s) for production.\n` +
      problems.map((problem) => `  - ${problem}`).join("\n") +
      "\nSee .env.example. Set SKIP_ENV_VALIDATION=true only for tasks that do not serve traffic.",
  );
}
