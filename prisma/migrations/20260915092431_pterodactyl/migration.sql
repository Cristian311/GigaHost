-- AlterTable
ALTER TABLE "Region" ADD COLUMN "pterodactylLocationId" INTEGER;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN "lastError" TEXT;
ALTER TABLE "Server" ADD COLUMN "providerIdentifier" TEXT;
ALTER TABLE "Server" ADD COLUMN "providerInternalId" INTEGER;

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "last" INTEGER NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "minRamGb" INTEGER NOT NULL,
    "recommendedRamGb" INTEGER NOT NULL,
    "minCpu" INTEGER NOT NULL DEFAULT 1,
    "minStorageGb" INTEGER NOT NULL DEFAULT 10,
    "versions" TEXT NOT NULL DEFAULT '[]',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "unavailableReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pterodactylNestId" INTEGER,
    "pterodactylEggId" INTEGER,
    "dockerImage" TEXT,
    "versionVariable" TEXT,
    "eggVariables" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Game" ("accentColor", "available", "createdAt", "description", "id", "image", "minCpu", "minRamGb", "minStorageGb", "name", "recommendedRamGb", "slug", "sortOrder", "tagline", "unavailableReason", "updatedAt", "versions") SELECT "accentColor", "available", "createdAt", "description", "id", "image", "minCpu", "minRamGb", "minStorageGb", "name", "recommendedRamGb", "slug", "sortOrder", "tagline", "unavailableReason", "updatedAt", "versions" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
