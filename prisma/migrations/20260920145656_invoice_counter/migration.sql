-- CreateTable
CREATE TABLE `InvoiceCounter` (
    `prefix` VARCHAR(191) NOT NULL,
    `next` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`prefix`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
