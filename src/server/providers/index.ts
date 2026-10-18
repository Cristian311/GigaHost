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

/**
 * Swaps the provider, so a test can make a call fail on purpose. Passing
 * undefined restores the configured one. The alternative — standing up a real
 * Pterodactyl — is not something a test suite can do, and the paths that matter
 * here are the ones where the provider refuses.
 */
export function setProviderForTests(next: ServerProvider | undefined) {
  cached = next;
}

export type * from "./types";
