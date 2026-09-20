import { getServerProviderKind } from "@/lib/env";
import { MockProvider } from "./mock-provider";
import { PterodactylProvider } from "./pterodactyl-provider";
import type { ServerProvider } from "./types";

let cached: ServerProvider | undefined;

/** Returns the configured provisioning backend (SERVER_PROVIDER=mock|pterodactyl). */
export function getProvider(): ServerProvider {
  if (cached) return cached;
  cached = getServerProviderKind() === "pterodactyl" ? new PterodactylProvider() : new MockProvider();
  return cached;
}

export type * from "./types";
