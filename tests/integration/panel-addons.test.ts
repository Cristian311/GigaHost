import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { installAddon, listAddons, uninstallAddon } from "@/server/services/addon-service";
import { listEvents } from "@/server/services/event-service";
import { deletePath, listFiles, readFile } from "@/server/services/file-service";
import { createServerFor, createUser, resetData, setStatus } from "../setup/db";

async function server(
  status: "RUNNING" | "STOPPED" = "STOPPED",
  overrides: Parameters<typeof createServerFor>[1] = {},
) {
  const user = await createUser();
  const { serverId } = await createServerFor(user.id, overrides);
  await setStatus(serverId, status);
  return { user, serverId };
}

const addonId = async (slug: string) =>
  (await prisma.addon.findUniqueOrThrow({ where: { slug } })).id;
const fileNames = async (serverId: string, userId: string, directory: string) =>
  (await listFiles(serverId, userId, directory)).entries.map((entry) => entry.name);

describe("add-ons", () => {
  beforeEach(resetData);

  it("offers only what works with the server's game", async () => {
    const minecraft = await server();
    const rust = await server("STOPPED", { gameSlug: "rust", ramGb: 8, vcpu: 3, storageGb: 40 });

    const forMinecraft = (await listAddons(minecraft.serverId, minecraft.user.id)).map((a) => a.slug);
    const forRust = (await listAddons(rust.serverId, rust.user.id)).map((a) => a.slug);

    expect(forMinecraft).toEqual(expect.arrayContaining(["essentialsx", "luckperms", "worldedit"]));
    expect(forMinecraft).not.toContain("oxide-umod");
    expect(forRust).toEqual(expect.arrayContaining(["oxide-umod", "rust-kits"]));
    expect(forRust).not.toContain("essentialsx");
  });

  it("installs a plugin into the right folder and marks it installed", async () => {
    const { user, serverId } = await server();
    const id = await addonId("essentialsx");

    const result = await installAddon(serverId, user.id, id);

    expect(result).toEqual({ restartRequired: false });
    expect(await fileNames(serverId, user.id, "plugins")).toContain("EssentialsX-2.21.0.jar");
    const listed = (await listAddons(serverId, user.id)).find((a) => a.slug === "essentialsx");
    expect(listed?.installed).toBe(true);
    expect((await listEvents(serverId))[0]).toMatchObject({
      type: "ADDON_INSTALLED",
      message: "EssentialsX 2.21.0",
    });
  });

  it("says a restart is needed when the server is running", async () => {
    const { user, serverId } = await server("RUNNING");
    expect(await installAddon(serverId, user.id, await addonId("vault"))).toEqual({
      restartRequired: true,
    });
  });

  it("installs a jar as a binary the editor will not open", async () => {
    const { user, serverId } = await server();
    await installAddon(serverId, user.id, await addonId("vault"));

    await expect(readFile(serverId, user.id, "plugins/Vault-1.7.3.jar")).rejects.toMatchObject({
      code: "file_not_editable",
    });
  });

  it("creates the install folder when it is missing", async () => {
    const { user, serverId } = await server();
    // Fabric mods go into mods/, which a Paper-style server does not have yet;
    // and the customer may have deleted plugins/ themselves.
    await deletePath(serverId, user.id, "plugins");

    await installAddon(serverId, user.id, await addonId("lithium"));
    await installAddon(serverId, user.id, await addonId("vault"));

    expect(await fileNames(serverId, user.id, "mods")).toEqual(["lithium-fabric-0.14.3.jar"]);
    expect(await fileNames(serverId, user.id, "plugins")).toEqual(["Vault-1.7.3.jar"]);
  });

  it("creates nested install folders for other games", async () => {
    const { user, serverId } = await server("STOPPED", {
      gameSlug: "valheim",
      ramGb: 4,
      vcpu: 2,
      storageGb: 10,
    });

    await installAddon(serverId, user.id, await addonId("valheim-plus"));

    expect(await fileNames(serverId, user.id, "BepInEx/plugins")).toContain("ValheimPlus.dll");
  });

  it("refuses to install twice, or something made for another game", async () => {
    const { user, serverId } = await server();
    const id = await addonId("essentialsx");
    await installAddon(serverId, user.id, id);

    await expect(installAddon(serverId, user.id, id)).rejects.toMatchObject({
      code: "addon_already_installed",
    });
    await expect(installAddon(serverId, user.id, await addonId("oxide-umod"))).rejects.toMatchObject({
      code: "addon_incompatible",
    });
    await expect(installAddon(serverId, user.id, "no-such-addon")).rejects.toMatchObject({
      code: "addon_not_found",
    });
  });

  it("uninstalls: removes the file and the mark", async () => {
    const { user, serverId } = await server();
    const id = await addonId("essentialsx");
    await installAddon(serverId, user.id, id);

    await uninstallAddon(serverId, user.id, id);

    expect(await fileNames(serverId, user.id, "plugins")).not.toContain("EssentialsX-2.21.0.jar");
    const listed = (await listAddons(serverId, user.id)).find((a) => a.slug === "essentialsx");
    expect(listed?.installed).toBe(false);
    expect((await listEvents(serverId))[0].type).toBe("ADDON_REMOVED");

    await expect(uninstallAddon(serverId, user.id, id)).rejects.toMatchObject({
      code: "addon_not_installed",
    });
  });

  it("belongs to the server's owner only", async () => {
    const { serverId } = await server();
    const stranger = await createUser();
    const id = await addonId("essentialsx");

    await expect(installAddon(serverId, stranger.id, id)).rejects.toMatchObject({
      code: "server_not_found",
    });
    await expect(listAddons(serverId, stranger.id)).rejects.toMatchObject({
      code: "server_not_found",
    });
  });
});
