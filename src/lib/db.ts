import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The Prisma CLI needs a `mysql://` URL, while the MariaDB driver only parses
 * `mariadb://` connection strings. Keeping a single DATABASE_URL in .env and
 * converting it here means both agree on the same database.
 */
function poolConfig(url: string) {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error(`DATABASE_URL is missing a database name: ${parsed.origin}/`);
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    // XAMPP's root account has no password by default, hence the empty string.
    password: decodeURIComponent(parsed.password),
    database,
    connectionLimit: Number(parsed.searchParams.get("connection_limit") ?? 5),
    // Dates are handled by Prisma; the driver must not turn them into strings.
    dateStrings: false,
  };
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaMariaDb(poolConfig(url)) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
