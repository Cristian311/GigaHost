import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_TIMINGS } from "@/lib/constants";
import { listEvents } from "@/server/services/event-service";
import {
  deleteServer,
  getServerEvents,
  getServerForUser,
  powerServer,
} from "@/server/services/server-service";
import { ageServer, createServerFor, createUser, resetData, setStatus } from "../setup/db";

describe("server activity log", () => {
  beforeEach(resetData);

  it("records creation with the ordered configuration", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id, {
      name: "Logged server",
      ramGb: 8,
      vcpu: 4,
      storageGb: 50,
      regionCode: "eu-de",
    });

    const events = await listEvents(serverId);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("CREATED");
    expect(events[0].message).toBe("Logged server");
    expect(events[0].meta).toMatchObject({
      gameSlug: "minecraft-java",
      regionCode: "eu-de",
      ramGb: 8,
    });
  });

  it("records the lifecycle transitions as they complete", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);

    await ageServer(serverId, MOCK_TIMINGS.installing + 1000);
    await getServerForUser(serverId, user.id); // INSTALLING -> STOPPED

    await powerServer(serverId, user.id, "start");
    await ageServer(serverId, MOCK_TIMINGS.starting + 1000);
    await getServerForUser(serverId, user.id); // STARTING -> RUNNING

    await powerServer(serverId, user.id, "stop");
    await ageServer(serverId, MOCK_TIMINGS.stopping + 1000);
    await getServerForUser(serverId, user.id); // STOPPING -> STOPPED

    const types = (await listEvents(serverId)).map((e) => e.type);
    expect(types).toEqual(["STOPPED", "STARTED", "INSTALLED", "CREATED"]);
  });

  it("records a restart at request time", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "RUNNING");

    await powerServer(serverId, user.id, "restart");

    const events = await listEvents(serverId);
    expect(events[0].type).toBe("RESTARTED");
  });

  it("does not log a transition twice when the status is read repeatedly", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await ageServer(serverId, MOCK_TIMINGS.installing + 1000);

    await getServerForUser(serverId, user.id);
    await getServerForUser(serverId, user.id);
    await getServerForUser(serverId, user.id);

    const installed = (await listEvents(serverId)).filter((e) => e.type === "INSTALLED");
    expect(installed).toHaveLength(1);
  });

  it("records deletion and keeps the history", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id, { name: "Temporary" });

    await deleteServer(serverId, user.id);

    const events = await listEvents(serverId);
    expect(events[0].type).toBe("DELETED");
    expect(events[0].message).toBe("Temporary");
    expect(events.some((e) => e.type === "CREATED")).toBe(true);
  });

  it("returns newest first and respects the limit", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "RUNNING");
    await powerServer(serverId, user.id, "restart");
    await setStatus(serverId, "RUNNING");
    await powerServer(serverId, user.id, "restart");

    const events = await listEvents(serverId, 2);
    expect(events).toHaveLength(2);
    expect(events[0].createdAt.getTime()).toBeGreaterThanOrEqual(events[1].createdAt.getTime());
  });

  it("hides the activity log from other users", async () => {
    const user = await createUser();
    const stranger = await createUser();
    const { serverId } = await createServerFor(user.id);

    await expect(getServerEvents(serverId, stranger.id)).rejects.toMatchObject({
      code: "server_not_found",
    });
    expect(await getServerEvents(serverId, user.id)).not.toHaveLength(0);
  });
});
