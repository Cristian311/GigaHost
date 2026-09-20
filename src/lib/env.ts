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
