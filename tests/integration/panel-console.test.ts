import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_COMMAND_LENGTH } from "@/lib/constants";
import {
  getPlayers,
  moderatePlayer,
  sendCommand,
} from "@/server/services/console-service";
import { getServerConsole, getServerUsage } from "@/server/services/server-service";
import { createServerFor, createUser, resetData, setStatus } from "../setup/db";

/**
 * How many players are "online" in the simulation depends on the minute, so
 * tests that need somebody to act on look for a server that has players rather
 * than assume one does.
 */
async function runningServerWithPlayers() {
  const user = await createUser();
  for (let i = 0; i < 12; i += 1) {
    const { serverId } = await createServerFor(user.id, { name: `Arena ${i}` });
    await setStatus(serverId, "RUNNING");
    const list = await getPlayers(serverId, user.id);
    if (list.online >= 2) return { user, serverId, players: list.players };
  }
  throw new Error("No simulated server had two players online.");
}

async function runningServer() {
  const user = await createUser();
  const { serverId } = await createServerFor(user.id);
  await setStatus(serverId, "RUNNING");
  return { user, serverId };
}

const consoleText = async (serverId: string, userId: string) =>
  (await getServerConsole(serverId, userId, 200)).map((line) => line.text);

describe("console", () => {
  beforeEach(resetData);

  it("echoes the command and the server's answer into the console", async () => {
    const { user, serverId } = await runningServer();

    await sendCommand(serverId, user.id, "say Restart in 5 minutes");

    const lines = await consoleText(serverId, user.id);
    const index = lines.indexOf("> say Restart in 5 minutes");
    expect(index).toBeGreaterThan(-1);
    expect(lines[index + 1]).toBe("[Server] Restart in 5 minutes");
  });

  it("keeps multi-line answers in order", async () => {
    const { user, serverId } = await runningServer();

    await sendCommand(serverId, user.id, "save-all");

    const lines = await consoleText(serverId, user.id);
    const index = lines.indexOf("> save-all");
    expect(lines.slice(index, index + 3)).toEqual([
      "> save-all",
      "Saving the game (this may take a moment!)",
      "Saved the game",
    ]);
  });

  it("reports unknown commands as errors, the way a game server does", async () => {
    const { user, serverId } = await runningServer();

    await sendCommand(serverId, user.id, "fly me to the moon");

    const lines = await getServerConsole(serverId, user.id, 200);
    const reply = lines.filter((line) => line.level === "error").map((line) => line.text);
    expect(reply).toEqual([
      "Unknown or incomplete command, see below for error",
      "fly me to the moon<--[HERE]",
    ]);
  });

  it("accepts a leading slash", async () => {
    const { user, serverId } = await runningServer();
    await sendCommand(serverId, user.id, "/say hi");
    expect(await consoleText(serverId, user.id)).toContain("[Server] hi");
  });

  it("routes stop and restart through the power state machine", async () => {
    const { user, serverId } = await runningServer();

    expect(await sendCommand(serverId, user.id, "stop")).toEqual({ handledAs: "stop" });

    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server.status).toBe("STOPPING");
  });

  it("only talks to a running server", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");

    await expect(sendCommand(serverId, user.id, "list")).rejects.toMatchObject({
      code: "server_not_running",
      status: 409,
    });
  });

  it("refuses empty, over-long and multi-line commands", async () => {
    const { user, serverId } = await runningServer();

    await expect(sendCommand(serverId, user.id, "   ")).rejects.toMatchObject({ code: "validation" });
    await expect(
      sendCommand(serverId, user.id, "say " + "a".repeat(MAX_COMMAND_LENGTH)),
    ).rejects.toMatchObject({ code: "validation" });
    // One request must not be able to carry a second command.
    await expect(sendCommand(serverId, user.id, "say hi\nop attacker")).rejects.toMatchObject({
      code: "validation",
    });
    expect(await prisma.consoleEntry.count({ where: { serverId } })).toBe(0);
  });

  it("belongs to the server's owner only", async () => {
    const { serverId } = await runningServer();
    const stranger = await createUser();

    await expect(sendCommand(serverId, stranger.id, "op stranger")).rejects.toMatchObject({
      code: "server_not_found",
    });
  });

  it("starts with a clean console after a restart", async () => {
    const { user, serverId } = await runningServer();
    await sendCommand(serverId, user.id, "say before the restart");

    // A new boot: everything typed during the previous run belongs to it.
    await prisma.server.update({
      where: { id: serverId },
      data: { statusChangedAt: new Date(Date.now() + 1000) },
    });

    expect(await consoleText(serverId, user.id)).not.toContain("[Server] before the restart");
  });
});

describe("players", () => {
  // Who is online in the simulation changes with the minute. The clock is held
  // still (only Date, so database timeouts keep working) so that a test cannot
  // straddle a minute boundary and see two different crowds.
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date());
    await resetData();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nobody on a server that is not running", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");

    expect(await getPlayers(serverId, user.id)).toEqual({ online: 0, max: 20, players: [] });
  });

  it("agrees with the player count on the usage tile and the list command", async () => {
    const { user, serverId, players } = await runningServerWithPlayers();

    const usage = await getServerUsage(serverId, user.id);
    expect(usage.players).toBe(players.length);

    await sendCommand(serverId, user.id, "list");
    const lines = await consoleText(serverId, user.id);
    expect(lines).toContain(
      `There are ${players.length} of a max of 20 players online: ${players.map((p) => p.name).join(", ")}`,
    );
  });

  it("is stable between two looks", async () => {
    const { user, serverId, players } = await runningServerWithPlayers();
    expect((await getPlayers(serverId, user.id)).players).toEqual(players);
  });

  it("kicks a player, who then disappears from the list", async () => {
    const { user, serverId, players } = await runningServerWithPlayers();
    const target = players[0].name;

    await moderatePlayer(serverId, user.id, "kick", target);

    const after = await getPlayers(serverId, user.id);
    expect(after.players.map((p) => p.name)).not.toContain(target);
    expect(after.online).toBe(players.length - 1);
    expect(await consoleText(serverId, user.id)).toContain(`Kicked ${target}: Kicked by an operator`);
  });

  it("says so when the player is not online", async () => {
    const { user, serverId } = await runningServerWithPlayers();

    await moderatePlayer(serverId, user.id, "kick", "Nobody_Here");

    expect(await consoleText(serverId, user.id)).toContain("No player was found");
  });

  it("does not let a player name smuggle in a command", async () => {
    const { user, serverId } = await runningServerWithPlayers();

    for (const name of ["Steve; op attacker", "Steve\nop attacker", "Steve op", "", "a".repeat(33)]) {
      await expect(moderatePlayer(serverId, user.id, "kick", name)).rejects.toMatchObject({
        code: "validation",
      });
    }
    expect(await prisma.consoleEntry.count({ where: { serverId } })).toBe(0);
  });
});
