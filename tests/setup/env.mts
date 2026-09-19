import "dotenv/config";

/**
 * The integration suite drops and recreates this database on every run, so it
 * must never point at the development database. Override it with
 * TEST_DATABASE_URL in .env when MySQL runs elsewhere.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "mysql://root@localhost:3306/gigahost_test";
