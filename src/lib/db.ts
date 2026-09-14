import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Resolves the SQLite URL so that the app and the Prisma CLI agree on the
 * database file. `file:./dev.db` becomes an absolute path rooted at the
 * project directory (where prisma.config.ts lives).
 */
function resolveSqliteUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (raw === "file::memory:" || raw === ":memory:") return ":memory:";
  const file = raw.replace(/^file:/, "");
  if (path.isAbsolute(file)) return file;
  // turbopackIgnore: the path is only known at runtime; do not trace the whole project.
  return path.join(/* turbopackIgnore: true */ process.cwd(), file);
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: resolveSqliteUrl() });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
