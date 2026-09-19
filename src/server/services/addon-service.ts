import { prisma } from "@/lib/db";
import type { Addon } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { recordEvent } from "./event-service";
import { panelAccess } from "./file-service";

function gamesOf(addon: Pick<Addon, "gameSlugs">): string[] {
  try {
    const parsed: unknown = JSON.parse(addon.gameSlugs);
    return Array.isArray(parsed) ? parsed.filter((slug) => typeof slug === "string") : [];
  } catch {
    return [];
  }
}

export type AddonView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: Addon["kind"];
  version: string;
  author: string;
  sizeKb: number;
  installed: boolean;
};

/** The catalogue for this server's game, with what is already installed marked. */
export async function listAddons(serverId: string, userId: string): Promise<AddonView[]> {
  const { server } = await panelAccess(serverId, userId);
  const [catalogue, installed] = await Promise.all([
    prisma.addon.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.serverAddon.findMany({ where: { serverId }, select: { addonId: true } }),
  ]);
  const installedIds = new Set(installed.map((row) => row.addonId));

  return catalogue
    .filter((addon) => gamesOf(addon).includes(server.game.slug))
    .map((addon) => ({
      id: addon.id,
      slug: addon.slug,
      name: addon.name,
      description: addon.description,
      kind: addon.kind,
      version: addon.version,
      author: addon.author,
      sizeKb: addon.sizeKb,
      installed: installedIds.has(addon.id),
    }));
}

export async function installAddon(serverId: string, userId: string, addonId: string) {
  const { server, ref, provider } = await panelAccess(serverId, userId);
  const addon = await prisma.addon.findUnique({ where: { id: addonId } });
  if (!addon) throw new AppError("addon_not_found", 404);
  // The catalogue is filtered in the UI, but the rule lives here.
  if (!gamesOf(addon).includes(server.game.slug)) throw new AppError("addon_incompatible", 400);

  const existing = await prisma.serverAddon.findUnique({
    where: { serverId_addonId: { serverId, addonId } },
  });
  if (existing) throw new AppError("addon_already_installed", 409);

  await provider.installAddon(ref, addon);
  await prisma.serverAddon.create({ data: { serverId, addonId } });
  await recordEvent(serverId, "ADDON_INSTALLED", `${addon.name} ${addon.version}`, {
    addonId: addon.id,
    slug: addon.slug,
  });

  // Add-ons are loaded at boot, so a running server has to be restarted.
  return { restartRequired: server.status === "RUNNING" };
}

export async function uninstallAddon(serverId: string, userId: string, addonId: string) {
  const { server, ref, provider } = await panelAccess(serverId, userId);
  const installed = await prisma.serverAddon.findUnique({
    where: { serverId_addonId: { serverId, addonId } },
    include: { addon: true },
  });
  if (!installed) throw new AppError("addon_not_installed", 404);

  await provider.uninstallAddon(ref, installed.addon);
  await prisma.serverAddon.delete({ where: { id: installed.id } });
  await recordEvent(serverId, "ADDON_REMOVED", installed.addon.name, {
    addonId: installed.addonId,
    slug: installed.addon.slug,
  });

  return { restartRequired: server.status === "RUNNING" };
}
