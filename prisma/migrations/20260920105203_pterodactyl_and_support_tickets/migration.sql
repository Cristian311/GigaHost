-- AlterTable
ALTER TABLE `Game` ADD COLUMN `dockerImage` VARCHAR(191) NULL,
    ADD COLUMN `eggVariables` VARCHAR(191) NOT NULL DEFAULT '{}',
    ADD COLUMN `pterodactylEggId` INTEGER NULL,
    ADD COLUMN `pterodactylNestId` INTEGER NULL,
    ADD COLUMN `versionVariable` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Region` ADD COLUMN `pterodactylLocationId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Server` ADD COLUMN `lastError` VARCHAR(191) NULL,
    ADD COLUMN `providerIdentifier` VARCHAR(191) NULL,
    ADD COLUMN `providerInternalId` INTEGER NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `lastSeenAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('TICKET', 'CHAT') NOT NULL DEFAULT 'TICKET',
    `subject` VARCHAR(191) NOT NULL,
    `category` ENUM('GENERAL', 'TECHNICAL', 'BILLING', 'ABUSE') NOT NULL DEFAULT 'GENERAL',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('OPEN', 'PENDING', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `userId` VARCHAR(191) NOT NULL,
    `assigneeId` VARCHAR(191) NULL,
    `serverId` VARCHAR(191) NULL,
    `awaitingStaff` BOOLEAN NOT NULL DEFAULT true,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Ticket_userId_idx`(`userId`),
    INDEX `Ticket_assigneeId_idx`(`assigneeId`),
    INDEX `Ticket_serverId_idx`(`serverId`),
    INDEX `Ticket_awaitingStaff_lastMessageAt_idx`(`awaitingStaff`, `lastMessageAt`),
    INDEX `Ticket_kind_status_idx`(`kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketMessage` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `isStaff` BOOLEAN NOT NULL DEFAULT false,
    `isInternal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketMessage_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    INDEX `TicketMessage_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `Server`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
