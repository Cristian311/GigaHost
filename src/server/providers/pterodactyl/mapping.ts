import type { ProviderStatus, PterodactylTarget, ProvisionInput } from "../types";
import type { PteroEgg, PteroEggVariable, PteroResources, PteroServer } from "./client";

/**
 * Pure translation between GigaHost concepts and Pterodactyl payloads.
 * Kept free of I/O so it can be unit tested without a panel.
 */

/** Maps Wings' power state (Client API `current_state`). */
export function mapClientState(state: string, isSuspended: boolean): ProviderStatus {
  if (isSuspended) return "SUSPENDED";
  switch (state) {
    case "running":
      return "RUNNING";
    case "starting":
      return "STARTING";
    case "stopping":
      return "STOPPING";
    case "offline":
      return "STOPPED";
    default:
      return "ERROR";
  }
}

/**
 * Maps the Application API server status. Returns null when the panel reports
 * nothing special, i.e. the power state must come from the Client API.
 */
export function mapApplicationStatus(
  server: Pick<PteroServer, "status" | "suspended" | "container">,
): ProviderStatus | null {
  if (server.suspended || server.status === "suspended") return "SUSPENDED";
  if (server.status === "install_failed" || server.status === "reinstall_failed") return "ERROR";
  if (server.status === "installing" || server.status === "restoring_backup") return "INSTALLING";
  const installed = server.container?.installed;
  if (installed === 0 || installed === false) return "INSTALLING";
  return null;
}

/**
 * Java major version a Minecraft release needs. Null for "latest" or any
 * version outside the 1.x scheme, meaning "use the newest Java available".
 */
export function javaVersionFor(mcVersion: string | null | undefined): number | null {
  const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(mcVersion?.trim() ?? "");
  if (!match) return null;
  const minor = Number(match[1]);
  const patch = Number(match[2] ?? 0);
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

/**
 * Picks the egg image for the requested version: the exact Java version, else
 * the closest newer one, else the newest. An explicit override always wins.
 */
export function pickDockerImage(
  egg: Pick<PteroEgg, "docker_image" | "docker_images">,
  override: string | null,
  mcVersion: string | null | undefined,
): string {
  if (override) return override;
  const images = Object.values(egg.docker_images ?? {});
  const javaImages = images
    .map((image) => ({ image, java: Number(/java[_-]?(\d+)/i.exec(image)?.[1]) }))
    .filter((candidate) => Number.isFinite(candidate.java))
    .sort((a, b) => a.java - b.java);
  if (javaImages.length === 0) return egg.docker_image || images[0] || "";

  const newest = javaImages[javaImages.length - 1].image;
  const wanted = javaVersionFor(mcVersion);
  if (wanted === null) return newest;
  return javaImages.find((candidate) => candidate.java >= wanted)?.image ?? newest;
}

/** Egg defaults, then the game's fixed variables, then the chosen version. */
export function buildEnvironment(
  variables: Array<Pick<PteroEggVariable, "env_variable" | "default_value">>,
  fixed: Record<string, string>,
  versionVariable: string | null,
  version: string | null | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const variable of variables) env[variable.env_variable] = variable.default_value ?? "";
  Object.assign(env, fixed);
  if (versionVariable && version) {
    env[versionVariable] = /^latest$/i.test(version) ? "latest" : version;
  }
  return env;
}

/** Resources a server is allowed, in the units the panel expects. */
export type PteroLimits = {
  memory: number;
  swap: number;
  disk: number;
  io: number;
  cpu: number;
};

/** What the panel counts separately from CPU and memory. */
export const FEATURE_LIMITS = { databases: 0, allocations: 1, backups: 3 } as const;

/**
 * Shared by creation and by resizing, so the two can never disagree about what
 * "8 GB and 4 vCPU" means — a resize that computed them differently would
 * silently change a customer's server on its next resize.
 */
export function buildLimits(spec: { ramGb: number; vcpu: number; storageGb: number }): PteroLimits {
  return {
    memory: spec.ramGb * 1024,
    swap: 0,
    disk: spec.storageGb * 1024,
    io: 500,
    // Pterodactyl expresses CPU as a percentage of one core.
    cpu: spec.vcpu * 100,
  };
}

/**
 * Body for PATCH /api/application/servers/{id}/build.
 *
 * The endpoint replaces the build wholesale rather than merging, so the
 * allocation has to be sent back or the panel unassigns the server's port and
 * players can no longer connect.
 */
export function buildResizeBody(
  spec: { ramGb: number; vcpu: number; storageGb: number },
  current: { allocation: number },
) {
  return {
    allocation: current.allocation,
    ...buildLimits(spec),
    feature_limits: FEATURE_LIMITS,
  };
}

/** Body for POST /api/application/servers. */
export function buildCreateServerBody(
  input: Pick<ProvisionInput, "serverId" | "name" | "ramGb" | "vcpu" | "storageGb" | "gameVersion">,
  target: PterodactylTarget,
  egg: PteroEgg,
  ownerUserId: number,
) {
  const variables = egg.relationships?.variables?.data.map((item) => item.attributes) ?? [];
  return {
    name: input.name,
    external_id: input.serverId,
    user: ownerUserId,
    egg: target.eggId,
    docker_image: pickDockerImage(egg, target.dockerImage, input.gameVersion),
    startup: egg.startup,
    environment: buildEnvironment(variables, target.variables, target.versionVariable, input.gameVersion),
    limits: buildLimits(input),
    feature_limits: FEATURE_LIMITS,
    // Let the panel pick a node with room and a free port in the region's location.
    deploy: { locations: [target.locationId], dedicated_ip: false, port_range: [] as string[] },
    // Matches the mock: installs end STOPPED and the owner presses Start.
    start_on_completion: false,
  };
}

/** Public address of the primary allocation; the alias is the public-facing IP. */
export function pickAddress(server: PteroServer): { ip: string; port: number } | null {
  const allocations = server.relationships?.allocations?.data.map((item) => item.attributes) ?? [];
  const primary = allocations.find((a) => a.id === server.allocation) ?? allocations[0];
  if (!primary) return null;
  return { ip: primary.alias || primary.ip, port: primary.port };
}

/** One usage sample, with CPU relative to the server's own limit. */
export function toResourceSample(
  resources: PteroResources["resources"],
  limits: { vcpu: number },
) {
  const MB = 1024 * 1024;
  return {
    cpuPct: Math.max(0, Math.min(100, Math.round(resources.cpu_absolute / Math.max(1, limits.vcpu)))),
    ramUsedMb: Math.round(resources.memory_bytes / MB),
    diskUsedMb: Math.round(resources.disk_bytes / MB),
    uptimeSec: Math.floor(resources.uptime / 1000),
  };
}
