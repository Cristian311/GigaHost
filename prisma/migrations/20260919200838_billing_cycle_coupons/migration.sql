-- AlterTable
ALTER TABLE `order` ADD COLUMN `couponDiscountCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `couponId` VARCHAR(191) NULL,
    ADD COLUMN `creditAppliedCents` INTEGER NOT NULL DEFAULT 0,
    MODIFY `kind` ENUM('NEW', 'RESIZE', 'RENEWAL') NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE `server` ADD COLUMN `suspensionReason` ENUM('BILLING', 'ADMIN') NULL;

-- AlterTable
ALTER TABLE `serverevent` MODIFY `type` ENUM('CREATED', 'INSTALLED', 'STARTED', 'STOPPED', 'RESTARTED', 'RESIZED', 'BACKUP_CREATED', 'BACKUP_RESTORED', 'BACKUP_DELETED', 'SUSPENDED', 'UNSUSPENDED', 'RENEWED', 'PAYMENT_FAILED', 'DELETED', 'ERROR') NOT NULL;

-- AlterTable
ALTER TABLE `subscription` ADD COLUMN `chargeAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastChargeAttemptAt` DATETIME(3) NULL,
    ADD COLUMN `pastDueSince` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `Coupon` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `kind` ENUM('PERCENT', 'FIXED') NOT NULL,
    `value` INTEGER NOT NULL,
    `maxRedemptions` INTEGER NULL,
    `timesRedeemed` INTEGER NOT NULL DEFAULT 0,
    `perUserLimit` INTEGER NOT NULL DEFAULT 1,
    `minOrderCents` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Coupon_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CouponRedemption` (
    `id` VARCHAR(191) NOT NULL,
    `couponId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CouponRedemption_orderId_key`(`orderId`),
    INDEX `CouponRedemption_couponId_userId_idx`(`couponId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_serverId_kind_status_idx` ON `Order`(`serverId`, `kind`, `status`);

-- CreateIndex
CREATE INDEX `Subscription_status_currentPeriodEnd_idx` ON `Subscription`(`status`, `currentPeriodEnd`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
