// Creates and applies a migration from the difference between the development
// database and prisma/schema.prisma.
//
//   npm run db:migrate -- add_something
//
// `prisma migrate dev` is not used because it insists on an interactive
// terminal as soon as a change carries a warning (a new unique column, say),
// and because MySQL on Windows makes it emit lower-cased table names (see
// fix-migration-casing.mjs). The development database must be in sync with the
// existing migrations, which it is as long as they are only applied through
// this script or `prisma migrate deploy`.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const name = (process.argv[2] ?? "").trim().replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase();
if (!name) {
  console.error("Usage: npm run db:migrate -- <migration_name>");
  process.exit(1);
}

const run = (command) => execSync(command, { cwd: root, stdio: "inherit" });

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = path.join(root, "prisma", "migrations", `${stamp}_${name}`);
const file = path.join(dir, "migration.sql");
mkdirSync(dir, { recursive: true });

run(
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o "${file}"`,
);

const sql = readFileSync(file, "utf8").trim();
if (!sql || sql.startsWith("-- This is an empty migration")) {
  rmSync(dir, { recursive: true, force: true });
  console.log("Schema and database already match; no migration created.");
  process.exit(0);
}

run("node scripts/fix-migration-casing.mjs");
run("npx prisma migrate deploy");
run("npx prisma generate");
console.log(`\nCreated and applied ${path.relative(root, dir)}`);
