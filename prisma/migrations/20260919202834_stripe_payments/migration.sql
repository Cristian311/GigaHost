-- AlterTable
ALTER TABLE `Order` ADD COLUMN `paymentProvider` VARCHAR(191) NULL,
    ADD COLUMN `paymentReference` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `stripeCustomerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Order_paymentReference_key` ON `Order`(`paymentReference`);

-- CreateIndex
CREATE UNIQUE INDEX `User_stripeCustomerId_key` ON `User`(`stripeCustomerId`);
