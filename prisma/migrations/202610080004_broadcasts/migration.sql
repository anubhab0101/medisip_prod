ALTER TABLE `NotificationLog` ADD COLUMN `broadcastId` VARCHAR(191) NULL;
CREATE INDEX `NotificationLog_broadcastId_idx` ON `NotificationLog`(`broadcastId`);
CREATE TABLE `Broadcast` (
  `id` VARCHAR(191) NOT NULL,
  `branchId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `operationId` VARCHAR(100) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `channel` ENUM('SMS','WHATSAPP','EMAIL') NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
  `recipientCount` INTEGER NOT NULL,
  `skippedCount` INTEGER NOT NULL,
  `scheduledFor` DATETIME(3) NOT NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Broadcast_operationId_key` (`operationId`),
  INDEX `Broadcast_branchId_createdAt_idx` (`branchId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
