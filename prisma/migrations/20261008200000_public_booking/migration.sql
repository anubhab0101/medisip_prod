CREATE TABLE `PublicBookingLink` (
  `branchId` VARCHAR(191) NOT NULL,
  `token` VARCHAR(43) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT false,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PublicBookingLink_token_key` (`token`),
  PRIMARY KEY (`branchId`),
  CONSTRAINT `PublicBookingLink_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
