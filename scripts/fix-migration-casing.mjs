// MySQL on Windows (and macOS) folds table names to lower case, so migrations
// generated there say ALTER TABLE `order` while the table was created as
// `Order`. On Linux, where table names are case sensitive, such a migration
// fails with "table doesn't exist". This rewrites table references in every
// migration to the casing of the Prisma models.
//
// Usage: node scripts/fix-migration-casing.mjs [--check]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "prisma", "migrations");
const checkOnly = process.argv.includes("--check");

const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
const byLowerCase = new Map(models.map((name) => [name.toLowerCase(), name]));

// Only names that follow a table-position keyword are touched, so a column that
// happens to share a model's name is left alone.
const TABLE_REFERENCE =
  /\b(ALTER TABLE|CREATE TABLE|DROP TABLE|RENAME TABLE|REFERENCES|INSERT INTO|UPDATE|FROM|JOIN|ON)(\s+)`([^`]+)`/g;

let changed = 0;
for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(migrationsDir, entry.name, "migration.sql");
  const before = readFileSync(file, "utf8");
  const after = before.replace(TABLE_REFERENCE, (whole, keyword, space, name) => {
    const model = byLowerCase.get(name.toLowerCase());
    return model && model !== name ? `${keyword}${space}\`${model}\`` : whole;
  });
  if (after === before) continue;
  changed += 1;
  if (checkOnly) console.error(`wrong table casing: ${path.relative(root, file)}`);
  else {
    writeFileSync(file, after);
    console.log(`fixed table casing: ${path.relative(root, file)}`);
  }
}

if (checkOnly && changed > 0) process.exit(1);
if (changed === 0) console.log("migrations: table casing ok");
