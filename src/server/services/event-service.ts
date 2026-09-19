import { prisma } from "@/lib/db";
import type { ServerEventType } from "@/generated/prisma/client";

/**
 * Appends an entry to a server's activity log.
 *
 * Logging must never break the action that triggered it, so failures are
 * swallowed after being reported.
 */
export async function recordEvent(
  serverId: string,
  type: ServerEventType,
  message?: string,
  meta?: unknown,
) {
  try {
    await prisma.serverEvent.create({
      data: {
        serverId,
        type,
        message: message ?? null,
        meta: meta === undefined ? null : JSON.stringify(meta),
      },
    });
  } catch (error) {
    console.error("Failed to record server event", { serverId, type, error });
  }
}

export type ServerEventView = {
  id: string;
  type: ServerEventType;
  message: string | null;
  meta: unknown;
  createdAt: Date;
};

function parseMeta(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Newest first. Ownership must be checked by the caller. */
export async function listEvents(serverId: string, limit = 50): Promise<ServerEventView[]> {
  const events = await prisma.serverEvent.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return events.map((event) => ({
    id: event.id,
    type: event.type,
    message: event.message,
    meta: parseMeta(event.meta),
    createdAt: event.createdAt,
  }));
}
