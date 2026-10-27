ALTER TABLE `User`
  ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `ProviderIntegration` (
  `id` VARCHAR(191) NOT NULL,
  `branchId` VARCHAR(191) NOT NULL,
  `provider` ENUM('SMSGATE', 'EVOLUTION_GO') NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `encryptedConfig` TEXT NOT NULL,
  `lastTestAt` DATETIME(3) NULL,
  `lastTestStatus` VARCHAR(32) NULL,
  `lastTestMessage` VARCHAR(255) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ProviderIntegration_branchId_provider_key` (`branchId`, `provider`),
  INDEX `ProviderIntegration_branchId_enabled_idx` (`branchId`, `enabled`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ProviderIntegration_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
