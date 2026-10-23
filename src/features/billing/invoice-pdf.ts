import "server-only";
import type { Prisma } from "@prisma/client";
import type { Content } from "pdfmake/interfaces";
import { z } from "zod";
import { pdfText, pdfTable, renderPdf } from "@/server/pdf";
import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";

const shopSchema = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  gstin: z.string(),
  drugLicenseNo: z.string(),
});
type Invoice = Prisma.SaleGetPayload<{
  include: { items: true; payments: true; returns: true };
}>;

export async function invoicePdf(sale: Invoice) {
  const shop = shopSchema.parse(sale.shopSnapshot);
  const content: Content[] = [
    pdfText(shop.name, { fontSize: 18, bold: true }),
    pdfText(shop.address, { margin: [0, 4, 0, 0] }),
    pdfText(shop.phone),
    pdfText(
      `GSTIN: ${shop.gstin || "Not registered"} | Drug licence: ${shop.drugLicenseNo}`,
      { margin: [0, 4, 0, 14] },
    ),
    pdfText(sale.invoiceNo, { fontSize: 13, bold: true }),
    pdfText(`${shopDate(sale.createdAt)} | Status: ${sale.status}`, {
      margin: [0, 3, 0, 12],
    }),
    pdfTable(
      [
        "Medicine / batch / expiry",
        "HSN",
        "Qty",
        "Unit price",
        "GST",
        "Amount",
      ],
      sale.items.map((item) => [
        `${item.name}\nBatch: ${item.batchNo} | Exp: ${item.expiryDate.toISOString().slice(0, 7)}${item.returnedQuantity ? `\nReturned: ${item.returnedQuantity}` : ""}`,
        item.hsn,
        item.quantity,
        formatMoney(item.unitPricePaise),
        `${item.gstBasisPoints / 100}%`,
        formatMoney(item.totalPaise),
      ]),
      ["*", 43, 25, 62, 35, 66],
    ),
    {
      margin: [260, 12, 0, 12],
      ...pdfTable(
        ["Summary", "INR"],
        [
          ["Discount", formatMoney(sale.discountPaise)],
          ["Taxable amount", formatMoney(sale.taxablePaise)],
          ["CGST", formatMoney(sale.cgstPaise)],
          ["SGST", formatMoney(sale.sgstPaise)],
          ["Round-off", formatMoney(sale.roundOffPaise)],
          ["Invoice total", formatMoney(sale.totalPaise)],
        ],
      ),
    },
    pdfText(
      sale.payments
        .map((p) => `${p.method}: ${formatMoney(p.amountPaise)}`)
        .join(" | "),
    ),
  ];
  if (sale.returns.length) {
    content.push(
      pdfText("Recorded returns", {
        bold: true,
        fontSize: 12,
        margin: [0, 14, 0, 5],
      }),
    );
    for (const returned of sale.returns)
      content.push(
        pdfText(
          `${shopDate(returned.createdAt)} - ${returned.reason}\nTotal: ${formatMoney(returned.amountPaise)} | Credit reduced: ${formatMoney(returned.creditRefundPaise)} | Refund (${returned.refundMethod}): ${formatMoney(returned.cashRefundPaise)}`,
          { margin: [0, 0, 0, 7] },
        ),
      );
  }
  content.push(pdfText("Get well soon.", { margin: [0, 14, 0, 0] }));
  // No navigation, staff identifiers, customer contacts or prescription details in downloadable receipts.
  return renderPdf(sale.invoiceNo, content);
}
