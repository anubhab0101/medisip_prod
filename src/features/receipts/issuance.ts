import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";

import { transaction } from "@/server/transaction";

import { BusinessError } from "@/lib/errors";
import { shopDate } from "@/lib/date";

import { receiptOrigin } from "./config";
import { receiptSchema } from "./render";
import { getSecret } from "@/lib/secret-manager";

// Reduced from 30 days to 24 hours for security
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function issueReceipt(
  branchId: string,
  saleId: string,
  shareId: string = randomUUID(),
) {
  let origin: string;
  try {
    origin = receiptOrigin(process.env.RECEIPT_PUBLIC_URL, process.env.APP_URL);
  } catch {
    throw new BusinessError(
      "Set up the separate receipt service before sharing a link.",
      "UNAVAILABLE",
    );
  }
  const secret = await getSecret("RECEIPT_TOKEN_SECRET");
  if (!secret || secret.length < 32)
    throw new BusinessError("Receipt sharing is not configured yet.", "UNAVAILABLE");
  const token = createHmac("sha256", secret)
    .update(`receipt:${shareId}`)
    .digest("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Sale WHERE id=${saleId} AND branchId=${branchId} FOR UPDATE`;
    const existing = await tx.receiptShare.findUnique({
      where: { id: shareId },
    });
    if (existing) {
      if (
        existing.branchId !== branchId ||
        existing.saleId !== saleId ||
        existing.revokedAt ||
        existing.expiresAt <= new Date() ||
        existing.tokenHash !== tokenHash
      )
        throw new BusinessError(
          "This receipt link is no longer available. Create a new one.",
          "EXPIRED",
        );
      return `${origin}/r/${token}`;
    }
    const sale = await tx.sale.findFirst({
      where: { id: saleId, branchId },
      include: {
        items: true,
        returns: true,
        branch: { select: { demo: true } },
      },
    });
    if (!sale) throw new BusinessError("Bill not found in this shop.", "NOT_FOUND");
    const snapshot = receiptSchema.parse({
      shop: sale.shopSnapshot,
      invoiceNo: sale.invoiceNo,
      date: shopDate(sale.createdAt),
      status: sale.status,
      practice: sale.branch.demo,
      items: sale.items.map((item) => ({
        name: item.name,
        batch: item.batchNo,
        expiry: item.expiryDate.toISOString().slice(0, 7),
        hsn: item.hsn,
        quantity: item.quantity,
        returned: item.returnedQuantity,
        mrp: item.unitPricePaise,
        total: item.totalPaise,
      })),
      discount: sale.discountPaise,
      cgst: sale.cgstPaise,
      sgst: sale.sgstPaise,
      roundOff: sale.roundOffPaise,
      total: sale.totalPaise,
      refunded: sale.returns.reduce((sum, r) => sum + r.amountPaise, 0),
    });
    await tx.receiptShare.create({
      data: {
        id: shareId,
        branchId,
        saleId,
        tokenHash,
        snapshot,
        expiresAt: new Date(Date.now() + RECEIPT_EXPIRY_MS),
      },
    });
    return `${origin}/r/${token}`;
  });
}
