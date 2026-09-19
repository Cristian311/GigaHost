-- AlterTable
ALTER TABLE `ServerEvent` MODIFY `type` ENUM('CREATED', 'INSTALLED', 'STARTED', 'STOPPED', 'RESTARTED', 'RESIZED', 'BACKUP_CREATED', 'BACKUP_RESTORED', 'BACKUP_DELETED', 'SUSPENDED', 'UNSUSPENDED', 'RENEWED', 'PAYMENT_FAILED', 'ADDON_INSTALLED', 'ADDON_REMOVED', 'TASK_RAN', 'DELETED', 'ERROR') NOT NULL;

-- CreateTable
CREATE TABLE `ServerFile` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `isDirectory` BOOLEAN NOT NULL DEFAULT false,
    `isBinary` BOOLEAN NOT NULL DEFAULT false,
    `content` TEXT NULL,
    `sizeBytes` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServerFile_serverId_path_key`(`serverId`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsoleEntry` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `kind` ENUM('COMMAND', 'OUTPUT') NOT NULL,
    `level` VARCHAR(191) NOT NULL DEFAULT 'info',
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConsoleEntry_serverId_createdAt_idx`(`serverId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledTask` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `action` ENUM('RESTART', 'BACKUP', 'COMMAND') NOT NULL,
    `payload` VARCHAR(191) NULL,
    `frequency` ENUM('HOURLY', 'DAILY', 'WEEKLY') NOT NULL,
    `everyHours` INTEGER NOT NULL DEFAULT 1,
    `minuteOfDayUtc` INTEGER NOT NULL DEFAULT 0,
    `dayOfWeekUtc` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `nextRunAt` DATETIME(3) NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastStatus` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ScheduledTask_enabled_nextRunAt_idx`(`enabled`, `nextRunAt`),
    INDEX `ScheduledTask_serverId_idx`(`serverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Addon` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `kind` ENUM('PLUGIN', 'MOD', 'MODPACK') NOT NULL,
    `gameSlugs` VARCHAR(512) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `author` VARCHAR(191) NOT NULL,
    `sizeKb` INTEGER NOT NULL,
    `installDir` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Addon_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServerAddon` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `addonId` VARCHAR(191) NOT NULL,
    `installedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ServerAddon_serverId_addonId_key`(`serverId`, `addonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ServerFile` ADD CONSTRAINT `ServerFile_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsoleEntry` ADD CONSTRAINT `ConsoleEntry_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledTask` ADD CONSTRAINT `ScheduledTask_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServerAddon` ADD CONSTRAINT `ServerAddon_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServerAddon` ADD CONSTRAINT `ServerAddon_addonId_fkey` FOREIGN KEY (`addonId`) REFERENCES `Addon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
