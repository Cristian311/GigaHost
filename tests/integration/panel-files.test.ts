import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_EDITABLE_FILE_BYTES } from "@/lib/constants";
import {
  createDirectory,
  deletePath,
  listFiles,
  readFile,
  writeFile,
} from "@/server/services/file-service";
import { createServerFor, createUser, resetData, setStatus } from "../setup/db";

async function installedServer(overrides: Parameters<typeof createServerFor>[1] = {}) {
  const user = await createUser();
  const { serverId } = await createServerFor(user.id, { name: "Skyblock", ...overrides });
  await setStatus(serverId, "STOPPED");
  return { user, serverId };
}

const names = (result: Awaited<ReturnType<typeof listFiles>>) => result.entries.map((e) => e.name);

describe("file manager", () => {
  beforeEach(resetData);

  describe("browsing", () => {
    it("starts a Minecraft server with its usual files, folders first", async () => {
      const { user, serverId } = await installedServer();

      const root = await listFiles(serverId, user.id, "");

      expect(names(root).slice(0, 3)).toEqual(["logs", "plugins", "world"]);
      expect(names(root)).toEqual(
        expect.arrayContaining(["server.properties", "eula.txt", "ops.json", "whitelist.json"]),
      );
      expect(root.entries.find((e) => e.name === "plugins")).toMatchObject({ isDirectory: true });
    });

    it("writes the server's own name and port into its config", async () => {
      const { user, serverId } = await installedServer();
      const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });

      const { content } = await readFile(serverId, user.id, "server.properties");

      expect(content).toContain("motd=Skyblock");
      expect(content).toContain(`server-port=${server.port}`);
    });

    it("lists only the direct children of a folder", async () => {
      const { user, serverId } = await installedServer();

      expect(names(await listFiles(serverId, user.id, "world"))).toEqual(["region", "level.dat"]);
      expect(names(await listFiles(serverId, user.id, "world/region"))).toEqual(["r.0.0.mca"]);
    });

    it("gives other games their own layout", async () => {
      const { user, serverId } = await installedServer({
        gameSlug: "rust",
        ramGb: 8,
        vcpu: 3,
        storageGb: 40,
      });

      expect(names(await listFiles(serverId, user.id, ""))).toEqual(
        expect.arrayContaining(["server", "oxide"]),
      );
      const { content } = await readFile(serverId, user.id, "server/cfg/server.cfg");
      expect(content).toContain('server.hostname "Skyblock"');
    });

    it("answers 404 for a folder that does not exist, and refuses to list a file", async () => {
      const { user, serverId } = await installedServer();

      await expect(listFiles(serverId, user.id, "nope")).rejects.toMatchObject({
        code: "file_not_found",
      });
      await expect(listFiles(serverId, user.id, "eula.txt")).rejects.toMatchObject({
        code: "not_a_directory",
      });
    });
  });

  describe("editing", () => {
    it("saves changes to a config file", async () => {
      const { user, serverId } = await installedServer();
      const { content } = await readFile(serverId, user.id, "server.properties");

      await writeFile(serverId, user.id, "server.properties", content.replace("pvp=true", "pvp=false"));

      const after = await readFile(serverId, user.id, "server.properties");
      expect(after.content).toContain("pvp=false");
      const entry = (await listFiles(serverId, user.id, "")).entries.find(
        (e) => e.name === "server.properties",
      );
      expect(entry?.sizeBytes).toBe(Buffer.byteLength(after.content));
    });

    it("creates new files and folders", async () => {
      const { user, serverId } = await installedServer();

      await createDirectory(serverId, user.id, "plugins/MyPlugin");
      await writeFile(serverId, user.id, "plugins/MyPlugin/config.yml", "enabled: true\n");

      expect(names(await listFiles(serverId, user.id, "plugins/MyPlugin"))).toEqual(["config.yml"]);
      expect((await readFile(serverId, user.id, "plugins/MyPlugin/config.yml")).content).toBe(
        "enabled: true\n",
      );
    });

    it("needs the parent folder to exist", async () => {
      const { user, serverId } = await installedServer();

      await expect(
        writeFile(serverId, user.id, "missing/config.yml", "x"),
      ).rejects.toMatchObject({ code: "file_not_found" });
      await expect(createDirectory(serverId, user.id, "a/b/c")).rejects.toMatchObject({
        code: "file_not_found",
      });
    });

    it("refuses to create a folder that already exists", async () => {
      const { user, serverId } = await installedServer();
      await expect(createDirectory(serverId, user.id, "plugins")).rejects.toMatchObject({
        code: "path_exists",
      });
    });

    it("does not open or overwrite binary files and folders", async () => {
      const { user, serverId } = await installedServer();

      await expect(readFile(serverId, user.id, "world/level.dat")).rejects.toMatchObject({
        code: "file_not_editable",
      });
      await expect(writeFile(serverId, user.id, "world/level.dat", "x")).rejects.toMatchObject({
        code: "file_not_editable",
      });
      await expect(writeFile(serverId, user.id, "plugins", "x")).rejects.toMatchObject({
        code: "file_not_editable",
      });
    });

    it("limits the size of a saved file, counting bytes rather than characters", async () => {
      const { user, serverId } = await installedServer();

      await expect(
        writeFile(serverId, user.id, "big.txt", "a".repeat(MAX_EDITABLE_FILE_BYTES + 1)),
      ).rejects.toMatchObject({ code: "file_too_large", status: 413 });

      // "ș" is two bytes in UTF-8: fewer characters than the limit, more bytes.
      const twoByte = "ș".repeat(MAX_EDITABLE_FILE_BYTES / 2 + 1);
      expect(twoByte.length).toBeLessThan(MAX_EDITABLE_FILE_BYTES);
      await expect(writeFile(serverId, user.id, "big.txt", twoByte)).rejects.toMatchObject({
        code: "file_too_large",
      });

      await expect(
        writeFile(serverId, user.id, "ok.txt", "a".repeat(MAX_EDITABLE_FILE_BYTES)),
      ).resolves.toBeTruthy();
    });
  });

  describe("deleting", () => {
    it("removes a file", async () => {
      const { user, serverId } = await installedServer();

      await deletePath(serverId, user.id, "banned-ips.json");

      expect(names(await listFiles(serverId, user.id, ""))).not.toContain("banned-ips.json");
    });

    it("removes a folder with everything in it, and nothing else", async () => {
      const { user, serverId } = await installedServer();
      // A sibling whose name merely starts with "world".
      await createDirectory(serverId, user.id, "world_nether");
      await writeFile(serverId, user.id, "world_nether/notes.txt", "keep me");

      await deletePath(serverId, user.id, "world");

      const root = names(await listFiles(serverId, user.id, ""));
      expect(root).not.toContain("world");
      expect(root).toContain("world_nether");
      expect((await readFile(serverId, user.id, "world_nether/notes.txt")).content).toBe("keep me");
      expect(await prisma.serverFile.count({ where: { serverId, path: { startsWith: "world/" } } })).toBe(0);
    });

    it("refuses to delete the root or something that is not there", async () => {
      const { user, serverId } = await installedServer();

      await expect(deletePath(serverId, user.id, "")).rejects.toMatchObject({ code: "invalid_path" });
      await expect(deletePath(serverId, user.id, "/")).rejects.toMatchObject({ code: "invalid_path" });
      await expect(deletePath(serverId, user.id, "ghost.txt")).rejects.toMatchObject({
        code: "file_not_found",
      });
    });
  });

  describe("safety", () => {
    it.each([
      "../other-server/server.properties",
      "plugins/../../etc/passwd",
      "..",
      "C:\\Windows\\win.ini",
      "plugins\\..\\..\\secret",
      "server.properties\u0000.png",
    ])("refuses the path %j everywhere", async (path) => {
      const { user, serverId } = await installedServer();

      for (const attempt of [
        () => listFiles(serverId, user.id, path),
        () => readFile(serverId, user.id, path),
        () => writeFile(serverId, user.id, path, "x"),
        () => createDirectory(serverId, user.id, path),
        () => deletePath(serverId, user.id, path),
      ]) {
        await expect(attempt()).rejects.toMatchObject({ code: "invalid_path", status: 400 });
      }
    });

    it("keeps one customer out of another customer's files", async () => {
      const { serverId } = await installedServer();
      const stranger = await createUser();

      await expect(listFiles(serverId, stranger.id, "")).rejects.toMatchObject({
        code: "server_not_found",
      });
      await expect(readFile(serverId, stranger.id, "server.properties")).rejects.toMatchObject({
        code: "server_not_found",
      });
      await expect(writeFile(serverId, stranger.id, "x.txt", "x")).rejects.toMatchObject({
        code: "server_not_found",
      });
      await expect(deletePath(serverId, stranger.id, "eula.txt")).rejects.toMatchObject({
        code: "server_not_found",
      });
    });

    it("keeps two servers' files apart even when the paths match", async () => {
      const a = await installedServer();
      const b = await installedServer();

      await writeFile(a.serverId, a.user.id, "notes.txt", "from A");

      await expect(readFile(b.serverId, b.user.id, "notes.txt")).rejects.toMatchObject({
        code: "file_not_found",
      });
    });

    it("is closed while the server installs and while it is suspended", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id); // INSTALLING

      await expect(listFiles(serverId, user.id, "")).rejects.toMatchObject({
        code: "server_unavailable",
      });

      await setStatus(serverId, "SUSPENDED");
      await expect(readFile(serverId, user.id, "server.properties")).rejects.toMatchObject({
        code: "server_unavailable",
      });
    });
  });

  it("gives servers created before the file manager their files on first use", async () => {
    const { user, serverId } = await installedServer();
    await prisma.serverFile.deleteMany({ where: { serverId } });

    expect(names(await listFiles(serverId, user.id, ""))).toContain("server.properties");
  });
});
