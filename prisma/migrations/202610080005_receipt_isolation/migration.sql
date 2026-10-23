CREATE TABLE `ReceiptShare` (
  `id` VARCHAR(191) NOT NULL,
  `branchId` VARCHAR(191) NOT NULL,
  `saleId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `snapshot` JSON NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ReceiptShare_tokenHash_key` (`tokenHash`),
  INDEX `ReceiptShare_branchId_saleId_idx` (`branchId`,`saleId`),
  INDEX `ReceiptShare_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
