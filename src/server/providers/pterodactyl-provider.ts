import { getPterodactylConfig } from "@/lib/env";
import { AppError } from "@/server/errors";
import { pteroApp, pteroClient } from "./pterodactyl/client";
import {
  buildCreateServerBody,
  mapApplicationStatus,
  mapClientState,
  pickAddress,
  toResourceSample,
} from "./pterodactyl/mapping";
import type {
  ConsoleAccess,
  ConsoleLine,
  ProviderStatus,
  ProvisionInput,
  ProvisionResult,
  ResourceUsage,
  ServerProvider,
  ServerRef,
} from "./types";

const HISTORY_POINTS = 30;

function isNotFound(error: unknown) {
  return error instanceof AppError && error.code === "not_found";
}

/**
 * Real provisioning through a Pterodactyl Panel. All servers belong to one
 * panel user (PTERODACTYL_OWNER_USER_ID) in Phase 1; ownership is enforced by
 * GigaHost before any call reaches this class.
 */
export class PterodactylProvider implements ServerProvider {
  readonly name = "pterodactyl";

  /**
   * Usage history for the dashboard sparkline, kept per process. It resets on
   * restart and is not shared between instances (move to Redis when scaling).
   */
  private readonly history = new Map<string, ResourceUsage["history"]>();

  constructor() {
    getPterodactylConfig();
  }

  private ids(ref: ServerRef) {
    if (!ref.identifier || ref.internalId === null) {
      throw new AppError("invalid_transition", 409, "Server has no Pterodactyl identifiers.");
    }
    return { identifier: ref.identifier, internalId: ref.internalId };
  }

  async createServer(input: ProvisionInput): Promise<ProvisionResult> {
    const target = input.pterodactyl;
    if (!target) throw new AppError("game_not_configured", 400);

    const egg = (await pteroApp.getEgg(target.nestId, target.eggId)).attributes;
    const body = buildCreateServerBody(input, target, egg, getPterodactylConfig().ownerUserId);

    let created;
    try {
      created = (await pteroApp.createServer(body)).attributes;
    } catch (error) {
      // The panel rejects automatic deployment when no node in the location has
      // enough memory/disk or a free allocation.
      if (
        error instanceof AppError &&
        error.code === "provider_error" &&
        /allocation|node|deploy/i.test(error.message)
      ) {
        throw new AppError("no_capacity", 409, error.message);
      }
      throw error;
    }

    const server = (await pteroApp.getServer(created.id)).attributes;
    const address = pickAddress(server) ?? { ip: "0.0.0.0", port: 0 };
    return {
      providerId: server.uuid,
      identifier: server.identifier,
      internalId: server.id,
      ...address,
    };
  }

  async deleteServer(ref: ServerRef): Promise<void> {
    const { internalId } = this.ids(ref);
    try {
      await pteroApp.deleteServer(internalId);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    this.history.delete(ref.providerId);
  }

  async start(ref: ServerRef) {
    await pteroClient.power(this.ids(ref).identifier, "start");
  }

  async stop(ref: ServerRef) {
    await pteroClient.power(this.ids(ref).identifier, "stop");
  }

  async restart(ref: ServerRef) {
    await pteroClient.power(this.ids(ref).identifier, "restart");
  }

  async suspend(ref: ServerRef) {
    await pteroApp.suspend(this.ids(ref).internalId);
  }

  async unsuspend(ref: ServerRef) {
    await pteroApp.unsuspend(this.ids(ref).internalId);
  }

  async getStatus(ref: ServerRef): Promise<ProviderStatus> {
    const { identifier, internalId } = this.ids(ref);
    try {
      const resources = (await pteroClient.getResources(identifier)).attributes;
      return mapClientState(resources.current_state, resources.is_suspended);
    } catch (error) {
      if (isNotFound(error)) return "DELETED";
      if (!(error instanceof AppError && error.code === "invalid_transition")) throw error;
    }

    // 409 from the client API: installing, suspended or restoring. Ask the panel why.
    try {
      const server = (await pteroApp.getServer(internalId)).attributes;
      return mapApplicationStatus(server) ?? "STOPPED";
    } catch (error) {
      if (isNotFound(error)) return "DELETED";
      throw error;
    }
  }

  async getUsage(ref: ServerRef): Promise<ResourceUsage> {
    const { identifier } = this.ids(ref);
    const resources = (await pteroClient.getResources(identifier)).attributes;
    const sample = toResourceSample(resources.resources, ref);

    const history = [
      ...(this.history.get(ref.providerId) ?? []),
      { t: Date.now(), cpuPct: sample.cpuPct, ramUsedMb: sample.ramUsedMb },
    ].slice(-HISTORY_POINTS);
    this.history.set(ref.providerId, history);

    return {
      cpuPct: sample.cpuPct,
      ramUsedMb: sample.ramUsedMb,
      ramTotalMb: ref.ramGb * 1024,
      diskUsedMb: sample.diskUsedMb,
      diskTotalMb: ref.storageGb * 1024,
      // Needs a Minecraft status ping; planned for Phase 2.
      players: 0,
      uptimeSec: sample.uptimeSec,
      history,
    };
  }

  async getConsoleLines(): Promise<ConsoleLine[]> {
    // The live console streams from Wings over a websocket (see getConsoleAccess).
    return [];
  }

  async sendCommand(ref: ServerRef, command: string) {
    await pteroClient.sendCommand(this.ids(ref).identifier, command);
  }

  async getConsoleAccess(ref: ServerRef): Promise<ConsoleAccess | null> {
    const { data } = await pteroClient.getWebsocket(this.ids(ref).identifier);
    return { socketUrl: data.socket, token: data.token };
  }
}
