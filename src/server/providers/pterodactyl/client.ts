import { getPterodactylConfig } from "@/lib/env";
import { AppError } from "@/server/errors";

/**
 * Thin typed wrapper over the Pterodactyl Panel API.
 *  - Application API (ptla_ key): servers, eggs, locations.
 *  - Client API (ptlc_ key of the owner account): power, resources, console.
 * Every failure is converted to an AppError so callers never see raw HTTP.
 */

type Api = "application" | "client";
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type RequestOptions = { timeoutMs?: number; retry?: boolean };

const DEFAULT_TIMEOUT_MS = 15_000;

export type PteroObject<T> = { object: string; attributes: T };
export type PteroList<T> = {
  object: "list";
  data: PteroObject<T>[];
  meta?: { pagination: { total: number; current_page: number; total_pages: number } };
};

export type PteroAllocation = {
  id: number;
  ip: string;
  alias: string | null;
  port: number;
  assigned: boolean;
};

export type PteroServer = {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
  /** null when idle; "installing", "install_failed", "suspended", "restoring_backup", … */
  status: string | null;
  suspended?: boolean;
  /** Id of the primary allocation. */
  allocation: number;
  container?: { installed?: number | boolean };
  relationships?: { allocations?: PteroList<PteroAllocation> };
};

export type PteroEggVariable = {
  name: string;
  env_variable: string;
  default_value: string | null;
  rules: string;
};

export type PteroEgg = {
  id: number;
  name: string;
  docker_image: string;
  /** Label -> image (Pterodactyl ≥ 1.5). */
  docker_images?: Record<string, string>;
  startup: string;
  relationships?: { variables?: PteroList<PteroEggVariable> };
};

export type PteroNode = {
  id: number;
  name: string;
  fqdn: string;
  memory: number;
  disk: number;
  allocated_resources?: { memory: number; disk: number };
};

export type PteroLocation = {
  id: number;
  short: string;
  long: string | null;
  relationships?: { nodes?: PteroList<PteroNode> };
};

export type PteroResources = {
  current_state: string;
  is_suspended: boolean;
  resources: {
    memory_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    /** Milliseconds. */
    uptime: number;
  };
};

function errorDetail(body: unknown): string | undefined {
  const errors = (body as { errors?: Array<{ detail?: string }> } | null)?.errors;
  const text = errors?.map((e) => e.detail).filter(Boolean).join(" ");
  return text || undefined;
}

/** Maps a Pterodactyl HTTP failure to the application's error codes. */
export function toAppError(status: number, body: unknown): AppError {
  const detail = errorDetail(body) ?? `Pterodactyl responded with HTTP ${status}.`;
  const details = { status, detail };
  if (status === 404) return new AppError("not_found", 404, detail, details);
  // The client API answers 409 while a server installs, is suspended or restores a backup.
  if (status === 409) return new AppError("invalid_transition", 409, detail, details);
  if (status === 401 || status === 403) {
    return new AppError("provider_error", 502, `Pterodactyl rejected the API key: ${detail}`, details);
  }
  if (status >= 500) return new AppError("provider_unavailable", 503, detail, details);
  return new AppError("provider_error", 502, detail, details);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function pteroRequest<T>(
  api: Api,
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const config = getPterodactylConfig();
  const key = api === "application" ? config.appKey : config.clientKey;
  const url = `${config.url}/api/${api}${path}`;
  // Only reads are retried: repeating a POST could create a second server.
  const attempts = method === "GET" && options.retry !== false ? 2 : 1;

  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/vnd.pterodactyl.v1+json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      if (attempt < attempts) continue;
      throw new AppError(
        "provider_unavailable",
        503,
        `Cannot reach Pterodactyl at ${config.url}: ${(error as Error).message}`,
      );
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const parsed = text ? parseJson(text) : null;
    if (!response.ok) {
      if (response.status >= 500 && attempt < attempts) continue;
      throw toAppError(response.status, parsed);
    }
    return parsed as T;
  }
}

export const pteroApp = {
  createServer: (body: unknown) =>
    pteroRequest<PteroObject<PteroServer>>("application", "POST", "/servers", body),
  getServer: (id: number) =>
    pteroRequest<PteroObject<PteroServer>>("application", "GET", `/servers/${id}?include=allocations`),
  deleteServer: (id: number) => pteroRequest<void>("application", "DELETE", `/servers/${id}`),
  /**
   * Changes a server's resources. Replaces the whole build, so the caller must
   * send the allocation and feature limits back along with the new limits.
   */
  updateBuild: (id: number, body: unknown) =>
    pteroRequest<PteroObject<PteroServer>>("application", "PATCH", `/servers/${id}/build`, body),
  suspend: (id: number) => pteroRequest<void>("application", "POST", `/servers/${id}/suspend`),
  unsuspend: (id: number) => pteroRequest<void>("application", "POST", `/servers/${id}/unsuspend`),
  getEgg: (nestId: number, eggId: number) =>
    pteroRequest<PteroObject<PteroEgg>>(
      "application",
      "GET",
      `/nests/${nestId}/eggs/${eggId}?include=variables`,
    ),
  getLocation: (id: number) =>
    pteroRequest<PteroObject<PteroLocation>>("application", "GET", `/locations/${id}?include=nodes`),
  /** Cheapest authenticated call; used for the admin connection check. */
  ping: () =>
    pteroRequest<PteroList<PteroLocation>>("application", "GET", "/locations?per_page=1", undefined, {
      timeoutMs: 3_000,
      retry: false,
    }),
};

export const pteroClient = {
  getResources: (identifier: string) =>
    pteroRequest<PteroObject<PteroResources>>("client", "GET", `/servers/${identifier}/resources`),
  power: (identifier: string, signal: "start" | "stop" | "restart" | "kill") =>
    pteroRequest<void>("client", "POST", `/servers/${identifier}/power`, { signal }),
  sendCommand: (identifier: string, command: string) =>
    pteroRequest<void>("client", "POST", `/servers/${identifier}/command`, { command }),
  getWebsocket: (identifier: string) =>
    pteroRequest<{ data: { token: string; socket: string } }>(
      "client",
      "GET",
      `/servers/${identifier}/websocket`,
    ),
};
