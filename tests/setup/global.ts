import { execSync } from "node:child_process";
import mariadb from "mariadb";
import { TEST_DATABASE_URL } from "./env.mts";

/**
 * Rebuilds a throwaway MySQL database, applies the schema and seeds the catalog
 * once for the whole integration run. Test files then talk to the real services
 * through the real Prisma client.
 */
export async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.replace(/^\//, "");

  if (process.env.DATABASE_URL && process.env.DATABASE_URL === TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL must differ from DATABASE_URL: the integration suite drops its database.",
    );
  }
  if (!database) {
    throw new Error(`TEST_DATABASE_URL is missing a database name: ${TEST_DATABASE_URL}`);
  }

  // Drop and recreate rather than truncating, so a changed schema can never
  // leave stale columns behind.
  const admin = await mariadb.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.end();
  }

  // Prisma 7 takes the datasource URL from prisma.config.ts, hence the explicit --url.
  execSync(`npx prisma db push --url "${TEST_DATABASE_URL}"`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  // Seed through the application's own client so the adapter configuration is
  // exactly the one the tests will run against.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const [{ prisma }, { seed }] = await Promise.all([
    import("../../src/lib/db"),
    import("../../prisma/seed"),
  ]);

  try {
    await seed(prisma, { log: false });
  } finally {
    await prisma.$disconnect();
  }
}

export async function teardown() {
  // The database is left in place on purpose: it can be inspected after a
  // failing run and is rebuilt from scratch at the start of the next one.
}
