import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  deleteGame,
  deleteRegion,
  getAdminStats,
  listAllServers,
  listRegions,
  setUserRole,
  suspendServer,
  unsuspendServer,
  updatePricing,
  upsertGame,
  upsertRegion,
} from "@/server/services/admin-service";
import { listEvents } from "@/server/services/event-service";
import { getActivePricing } from "@/server/services/pricing-service";
import { powerServer } from "@/server/services/server-service";
import { createServerFor, createUser, resetData, setStatus } from "../setup/db";

describe("admin", () => {
  beforeEach(resetData);

  it("reports platform statistics", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "RUNNING");

    const stats = await getAdminStats();
    expect(stats.users).toBeGreaterThanOrEqual(2); // seeded admin + test user
    expect(stats.servers).toBe(1);
    expect(stats.runningServers).toBe(1);
    expect(stats.orders).toBe(1);
    expect(stats.revenueCents).toBeGreaterThan(0);
  });

  it("lists every server with its owner", async () => {
    const a = await createUser();
    const b = await createUser();
    await createServerFor(a.id, { name: "A server" });
    await createServerFor(b.id, { name: "B server" });

    const servers = await listAllServers();
    expect(servers).toHaveLength(2);
    expect(servers.map((s) => s.owner.email).sort()).toEqual([a.email, b.email].sort());
    expect(servers[0].game.name).toBeTruthy();
    expect(servers[0].region.flag).toBeTruthy();
  });

  it("suspends a server, blocks power actions and marks the subscription past due", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");

    const suspended = await suspendServer(serverId, "Payment failed");
    expect(suspended.status).toBe("SUSPENDED");

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    expect(sub.status).toBe("PAST_DUE");

    await expect(powerServer(serverId, user.id, "start")).rejects.toMatchObject({
      code: "invalid_transition",
    });

    const events = await listEvents(serverId);
    expect(events[0].type).toBe("SUSPENDED");
    expect(events[0].message).toBe("Payment failed");
  });

  it("unsuspends a server back to stopped", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");
    await suspendServer(serverId);

    const restored = await unsuspendServer(serverId);
    expect(restored.status).toBe("STOPPED");

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    expect(sub.status).toBe("ACTIVE");

    const server = await powerServer(serverId, user.id, "start");
    expect(server.status).toBe("STARTING");
  });

  it("refuses redundant suspend transitions", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");

    await expect(unsuspendServer(serverId)).rejects.toMatchObject({
      code: "invalid_transition",
    });

    await suspendServer(serverId);
    await expect(suspendServer(serverId)).rejects.toMatchObject({
      code: "invalid_transition",
    });

    await expect(suspendServer("does-not-exist")).rejects.toMatchObject({
      code: "server_not_found",
    });
  });

  it("updates the active pricing configuration", async () => {
    const before = await getActivePricing();

    await updatePricing({
      currency: "EUR",
      basePriceCents: 300,
      pricePerGbRamCents: 175,
      pricePerVcpuCents: 250,
      pricePerGbStorageCents: 12,
      quarterlyDiscount: 0.07,
      yearlyDiscount: 0.2,
    });

    const after = await getActivePricing();
    expect(after.id).toBe(before.id);
    expect(after.pricePerGbRamCents).toBe(175);
    expect(after.yearlyDiscount).toBe(0.2);

    // restore so later tests keep the seeded prices
    await updatePricing({
      currency: "EUR",
      basePriceCents: 200,
      pricePerGbRamCents: 150,
      pricePerVcpuCents: 200,
      pricePerGbStorageCents: 10,
      quarterlyDiscount: 0.05,
      yearlyDiscount: 0.15,
    });
  });

  it("creates, updates and hides games", async () => {
    const created = await upsertGame({
      slug: "test-game",
      name: "Test Game",
      tagline: "Just a test",
      description: "A game used by the test suite.",
      image: "/games/terraria.svg",
      accentColor: "#123456",
      minRamGb: 2,
      recommendedRamGb: 4,
      minCpu: 1,
      minStorageGb: 10,
      versions: "1.0, 2.0",
      available: true,
      sortOrder: 50,
    });
    expect(JSON.parse(created.versions)).toEqual(["1.0", "2.0"]);

    const updated = await upsertGame({
      id: created.id,
      slug: "test-game",
      name: "Test Game Renamed",
      tagline: "Still a test",
      description: "A game used by the test suite.",
      image: "/games/terraria.svg",
      accentColor: "#123456",
      minRamGb: 2,
      recommendedRamGb: 4,
      minCpu: 1,
      minStorageGb: 10,
      versions: "1.0",
      available: false,
      unavailableReason: "Testing",
      sortOrder: 50,
    });
    expect(updated.name).toBe("Test Game Renamed");
    expect(updated.available).toBe(false);
    expect(updated.unavailableReason).toBe("Testing");

    await deleteGame(created.id);
    expect(await prisma.game.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("hides instead of deleting a game that servers still use", async () => {
    const user = await createUser();
    await createServerFor(user.id, { gameSlug: "valheim" });
    const game = await prisma.game.findUniqueOrThrow({ where: { slug: "valheim" } });

    const result = await deleteGame(game.id);
    expect(result.available).toBe(false);
    expect(await prisma.game.findUnique({ where: { id: game.id } })).not.toBeNull();

    await prisma.game.update({ where: { id: game.id }, data: { available: true } });
  });

  it("manages regions", async () => {
    const region = await upsertRegion({
      code: "ap-sg",
      name: "Singapore",
      country: "Singapore",
      flag: "🇸🇬",
      priceMultiplier: 1.25,
      active: true,
      sortOrder: 9,
    });
    expect(region.priceMultiplier).toBe(1.25);

    const updated = await upsertRegion({
      id: region.id,
      code: "ap-sg",
      name: "Singapore",
      country: "Singapore",
      flag: "🇸🇬",
      priceMultiplier: 1.3,
      active: false,
      sortOrder: 9,
    });
    expect(updated.active).toBe(false);

    expect((await listRegions()).some((r) => r.code === "ap-sg")).toBe(true);

    await deleteRegion(region.id);
    expect(await prisma.region.findUnique({ where: { id: region.id } })).toBeNull();
  });

  it("deactivates instead of deleting a region that servers still use", async () => {
    const user = await createUser();
    await createServerFor(user.id, { regionCode: "eu-ro" });
    const region = await prisma.region.findUniqueOrThrow({ where: { code: "eu-ro" } });

    const result = await deleteRegion(region.id);
    expect(result.active).toBe(false);
    await prisma.region.update({ where: { id: region.id }, data: { active: true } });
  });

  it("changes user roles", async () => {
    const user = await createUser();
    expect(user.role).toBe("USER");

    const promoted = await setUserRole(user.id, "ADMIN");
    expect(promoted.role).toBe("ADMIN");

    const demoted = await setUserRole(user.id, "USER");
    expect(demoted.role).toBe("USER");
  });
});
