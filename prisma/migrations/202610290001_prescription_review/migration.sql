CREATE TABLE `Prescription` (
  `id` VARCHAR(191) NOT NULL,
  `branchId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NULL,
  `doctorName` VARCHAR(150) NOT NULL,
  `reference` VARCHAR(200) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `fileData` LONGBLOB NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewNote` VARCHAR(500) NOT NULL DEFAULT '',
  `uploadedBy` VARCHAR(191) NOT NULL,
  `reviewedBy` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Prescription_branchId_status_createdAt_idx` (`branchId`, `status`, `createdAt`),
  INDEX `Prescription_branchId_customerId_createdAt_idx` (`branchId`, `customerId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Prescription_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Prescription_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Sale` ADD COLUMN `prescriptionId` VARCHAR(191) NULL;
CREATE INDEX `Sale_prescriptionId_idx` ON `Sale` (`prescriptionId`);
ALTER TABLE `Sale`
  ADD CONSTRAINT `Sale_prescriptionId_fkey`
  FOREIGN KEY (`prescriptionId`) REFERENCES `Prescription` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
