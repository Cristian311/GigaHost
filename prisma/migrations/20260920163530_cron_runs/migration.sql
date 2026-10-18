-- CreateTable
CREATE TABLE `CronRun` (
    `id` VARCHAR(191) NOT NULL,
    `job` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `ok` BOOLEAN NULL,
    `detail` TEXT NULL,
    `durationMs` INTEGER NULL,

    INDEX `CronRun_job_startedAt_idx`(`job`, `startedAt`),
    INDEX `CronRun_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
