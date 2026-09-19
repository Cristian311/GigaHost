import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MOCK_TIMINGS } from "@/lib/constants";
import {
  deleteServer,
  getServerConsole,
  getServerForUser,
  getServerUsage,
  listServersForUser,
  powerServer,
  renameServer,
} from "@/server/services/server-service";
import { ageServer, createServerFor, createUser, resetData, setStatus } from "../setup/db";

describe("server lifecycle", () => {
  beforeEach(resetData);

  it("finishes installing after the install delay", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);

    let server = await getServerForUser(serverId, user.id);
    expect(server.status).toBe("INSTALLING");

    await ageServer(serverId, MOCK_TIMINGS.installing + 1000);
    server = await getServerForUser(serverId, user.id);
    expect(server.status).toBe("STOPPED");
  });

  it("walks stopped -> starting -> running -> stopping -> stopped", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await ageServer(serverId, MOCK_TIMINGS.installing + 1000);
    await getServerForUser(serverId, user.id);

    let server = await powerServer(serverId, user.id, "start");
    expect(server.status).toBe("STARTING");

    await ageServer(serverId, MOCK_TIMINGS.starting + 1000);
    server = await getServerForUser(serverId, user.id);
    expect(server.status).toBe("RUNNING");

    server = await powerServer(serverId, user.id, "stop");
    expect(server.status).toBe("STOPPING");

    await ageServer(serverId, MOCK_TIMINGS.stopping + 1000);
    server = await getServerForUser(serverId, user.id);
    expect(server.status).toBe("STOPPED");
  });

  it("restarts a running server", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "RUNNING");

    const server = await powerServer(serverId, user.id, "restart");
    expect(server.status).toBe("STARTING");
  });

  it("refuses power actions that do not apply to the current status", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);

    // Still INSTALLING
    await expect(powerServer(serverId, user.id, "start")).rejects.toMatchObject({
      code: "invalid_transition",
      status: 409,
    });

    await setStatus(serverId, "STOPPED");
    await expect(powerServer(serverId, user.id, "stop")).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await expect(powerServer(serverId, user.id, "restart")).rejects.toMatchObject({
      code: "invalid_transition",
    });

    await setStatus(serverId, "SUSPENDED");
    await expect(powerServer(serverId, user.id, "start")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });

  it("hides servers from other users", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { serverId } = await createServerFor(owner.id);

    await expect(getServerForUser(serverId, stranger.id)).rejects.toMatchObject({
      code: "server_not_found",
      status: 404,
    });
    await expect(powerServer(serverId, stranger.id, "start")).rejects.toMatchObject({
      code: "server_not_found",
    });
    await expect(renameServer(serverId, stranger.id, "Stolen")).rejects.toMatchObject({
      code: "server_not_found",
    });
    await expect(deleteServer(serverId, stranger.id)).rejects.toMatchObject({
      code: "server_not_found",
    });

    expect(await listServersForUser(stranger.id)).toHaveLength(0);
    expect(await listServersForUser(owner.id)).toHaveLength(1);
  });

  it("renames a server", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id, { name: "Old name" });

    const server = await renameServer(serverId, user.id, "New name");
    expect(server.name).toBe("New name");
  });

  it("deletes a server and cancels its subscription", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);

    await deleteServer(serverId, user.id);

    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    expect(server.status).toBe("DELETED");
    expect(sub.status).toBe("CANCELLED");
    expect(sub.cancelAtPeriodEnd).toBe(false);

    expect(await listServersForUser(user.id)).toHaveLength(0);
    await expect(getServerForUser(serverId, user.id)).rejects.toMatchObject({
      code: "server_not_found",
    });
  });

  it("reports usage and console output scaled to the server resources", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id, { ramGb: 16, storageGb: 100 });
    await setStatus(serverId, "RUNNING");

    const usage = await getServerUsage(serverId, user.id);
    expect(usage.ramTotalMb).toBe(16 * 1024);
    expect(usage.diskTotalMb).toBe(100 * 1024);
    expect(usage.history).toHaveLength(30);
    expect(usage.cpuPct).toBeGreaterThan(0);
    expect(usage.cpuPct).toBeLessThanOrEqual(100);
    expect(usage.diskUsedMb).toBeLessThanOrEqual(usage.diskTotalMb);

    const lines = await getServerConsole(serverId, user.id, 20);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(20);
    expect(lines[0]).toHaveProperty("level");
  });

  it("reports zero usage while stopped", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");

    const usage = await getServerUsage(serverId, user.id);
    expect(usage.cpuPct).toBe(0);
    expect(usage.ramUsedMb).toBe(0);
    expect(usage.players).toBe(0);
    expect(usage.uptimeSec).toBe(0);
  });
});
