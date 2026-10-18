-- AlterTable
ALTER TABLE `EmailMessage` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `EmailMessage_status_idx` ON `EmailMessage`(`status`);
