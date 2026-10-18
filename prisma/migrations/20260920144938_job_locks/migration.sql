-- CreateTable
CREATE TABLE `JobLock` (
    `name` VARCHAR(191) NOT NULL,
    `holder` VARCHAR(191) NOT NULL,
    `acquiredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `JobLock_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
