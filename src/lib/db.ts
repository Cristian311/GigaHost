import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The Prisma CLI needs a `mysql://` URL, while the MariaDB driver only parses
 * `mariadb://` connection strings. Keeping a single DATABASE_URL in .env and
 * converting it here means both agree on the same database.
 */
/**
 * TLS for the database connection, from `?sslaccept=` on the URL.
 *
 * A managed database is reached across a network, and without this the
 * password and every row travel in the clear. Off by default because the
 * development database is a local socket where TLS would only get in the way.
 *
 *   strict          verify the server certificate (what production wants)
 *   accept_invalid_certs  encrypt but do not verify — for a self-signed cert
 */
function tlsConfig(parsed: URL) {
  const mode = parsed.searchParams.get("sslaccept");
  if (!mode) return {};
  if (mode === "strict") return { ssl: true };
  if (mode === "accept_invalid_certs") return { ssl: { rejectUnauthorized: false } };
  throw new Error(
    `DATABASE_URL has sslaccept=${mode}; expected "strict" or "accept_invalid_certs".`,
  );
}

function poolConfig(url: string) {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error(`DATABASE_URL is missing a database name: ${parsed.origin}/`);
  }
  const number = (name: string, fallback: number) =>
    Number(parsed.searchParams.get(name) ?? fallback);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    // XAMPP's root account has no password by default, hence the empty string.
    password: decodeURIComponent(parsed.password),
    database,
    connectionLimit: number("connection_limit", 5),
    // Without these a database that stops answering hangs the request until the
    // platform's own timeout kills it, which looks like the app being down.
    connectTimeout: number("connect_timeout", 10_000),
    acquireTimeout: number("pool_timeout", 10_000),
    // Recycled before a managed database's own idle cut-off closes them under us.
    idleTimeout: number("idle_timeout", 60),
    // Dates are handled by Prisma; the driver must not turn them into strings.
    dateStrings: false,
    ...tlsConfig(parsed),
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
