import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("migrations", () => {
  // MySQL on Windows lower-cases table names, so a migration generated there can
  // say ALTER TABLE `order` for a table created as `Order`, which breaks on
  // Linux. `npm run db:migrate` fixes the casing; this catches a plain
  // `prisma migrate dev` that skipped it.
  it("reference tables with the casing of the Prisma models", () => {
    const script = path.resolve(import.meta.dirname, "../../scripts/fix-migration-casing.mjs");
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
