-- AlterTable
ALTER TABLE `Game` MODIFY `eggVariables` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `ScheduledTask` MODIFY `payload` TEXT NULL;

-- AlterTable
ALTER TABLE `Server` MODIFY `lastError` TEXT NULL;

-- AlterTable
ALTER TABLE `TicketMessage` MODIFY `body` TEXT NOT NULL;
