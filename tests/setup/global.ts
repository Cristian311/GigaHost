import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dbDir = path.join(root, "tests", ".tmp");
const dbFile = path.join(dbDir, "test.db");
const DATABASE_URL = `file:${dbFile}`;

/**
 * Creates a throwaway SQLite database, applies the schema and seeds the catalog
 * once for the whole integration run. Test files then talk to the real services
 * through the real Prisma client.
 */
export async function setup() {
  mkdirSync(dbDir, { recursive: true });
  rmSync(dbFile, { force: true });

  // The file was just deleted, so this creates a fresh database; no reset flag needed.
  // Prisma 7 takes the datasource URL from prisma.config.ts, hence the explicit --url.
  execSync(`npx prisma db push --url "${DATABASE_URL}"`, {
    cwd: root,
    env: { ...process.env, DATABASE_URL },
    stdio: "pipe",
  });

  process.env.DATABASE_URL = DATABASE_URL;
  const [{ PrismaClient }, { PrismaBetterSqlite3 }, { seed }] = await Promise.all([
    import("../../src/generated/prisma/client"),
    import("@prisma/adapter-better-sqlite3"),
    import("../../prisma/seed"),
  ]);

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbFile }) });
  try {
    await seed(prisma, { log: false });
  } finally {
    await prisma.$disconnect();
  }
}

export async function teardown() {
  // On Windows the SQLite handle can still be open in a worker; the file is
  // recreated on the next run anyway, so a failed cleanup must not fail the run.
  for (const file of [dbFile, `${dbFile}-journal`]) {
    try {
      rmSync(file, { force: true });
    } catch {
      // ignore
    }
  }
}
