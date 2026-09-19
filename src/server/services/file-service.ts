import { MAX_EDITABLE_FILE_BYTES } from "@/lib/constants";
import { InvalidPathError, normalizePath } from "@/lib/files/path";
import type { ServerStatus } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { getProvider } from "@/server/providers";
import type { ServerRef } from "@/server/providers/types";
import { getServerForUser, toRef } from "./server-service";

/** A server has files once it is installed, and the customer may see them unless it is suspended. */
const NO_FILE_ACCESS: ServerStatus[] = ["PENDING", "INSTALLING", "SUSPENDED", "DELETED"];

/** Ownership check + provider handle, shared by everything in the server panel. */
export async function panelAccess(serverId: string, userId: string) {
  const server = await getServerForUser(serverId, userId);
  if (NO_FILE_ACCESS.includes(server.status)) {
    throw new AppError("server_unavailable", 409, `The server is ${server.status}.`);
  }
  const ref = toRef(server);
  if (!ref) throw new AppError("server_unavailable", 409, "The server is not provisioned yet.");
  return { server, ref, provider: getProvider() };
}

/** Everything a client sends as a path goes through here before it reaches a provider. */
function safePath(input: unknown): string {
  try {
    return normalizePath(input);
  } catch (error) {
    if (error instanceof InvalidPathError) throw new AppError("invalid_path", 400, error.message);
    throw error;
  }
}

export async function listFiles(serverId: string, userId: string, directory: unknown) {
  const { ref, provider } = await panelAccess(serverId, userId);
  const path = safePath(directory ?? "");
  return { path, entries: await provider.listFiles(ref, path) };
}

export async function readFile(serverId: string, userId: string, file: unknown) {
  const { ref, provider } = await panelAccess(serverId, userId);
  const path = safePath(file);
  return { path, content: await provider.readFile(ref, path) };
}

export async function writeFile(serverId: string, userId: string, file: unknown, content: string) {
  const { ref, provider } = await panelAccess(serverId, userId);
  const path = safePath(file);
  if (!path) throw new AppError("invalid_path", 400, "A file name is required.");
  if (Buffer.byteLength(content, "utf8") > MAX_EDITABLE_FILE_BYTES) {
    throw new AppError("file_too_large", 413, undefined, { maxBytes: MAX_EDITABLE_FILE_BYTES });
  }
  await provider.writeFile(ref, path, content);
  return { path };
}

export async function createDirectory(serverId: string, userId: string, directory: unknown) {
  const { ref, provider } = await panelAccess(serverId, userId);
  const path = safePath(directory);
  if (!path) throw new AppError("invalid_path", 400, "A folder name is required.");
  await provider.createDirectory(ref, path);
  return { path };
}

export async function deletePath(serverId: string, userId: string, target: unknown) {
  const { ref, provider } = await panelAccess(serverId, userId);
  const path = safePath(target);
  if (!path) throw new AppError("invalid_path", 400, "The server root cannot be deleted.");
  await provider.deletePath(ref, path);
}

export type { ServerRef };
