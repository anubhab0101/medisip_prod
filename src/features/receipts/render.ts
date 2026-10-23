import { z } from "zod";
export const receiptSchema = z.object({
  shop: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    gstin: z.string(),
    drugLicenseNo: z.string(),
  }),
  invoiceNo: z.string(),
  date: z.string(),
  status: z.string(),
  practice: z.boolean(),
  items: z.array(
    z.object({
      name: z.string(),
      batch: z.string(),
      expiry: z.string(),
      hsn: z.string(),
      quantity: z.number().int(),
      returned: z.number().int(),
      mrp: z.number().int(),
      total: z.number().int(),
    }),
  ),
  discount: z.number().int(),
  cgst: z.number().int(),
  sgst: z.number().int(),
  roundOff: z.number().int(),
  total: z.number().int(),
  refunded: z.number().int(),
});
export type ReceiptSnapshot = z.infer<typeof receiptSchema>;
export function escapeHtml(value: string | number) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
const money = (value: number) => `₹${(value / 100).toFixed(2)}`;
export function renderReceipt(raw: unknown) {
  const r = receiptSchema.parse(raw),
    e = escapeHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Receipt ${e(r.invoiceNo)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f7f7;color:#19352f;font:15px system-ui,sans-serif}main{max-width:760px;margin:24px auto;background:white;padding:24px;border:1px solid #dde6e3;border-radius:12px}h1{font-size:24px;margin:0 0 8px}p{line-height:1.5;overflow-wrap:anywhere}small{display:block;color:#536d65}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px 6px;text-align:left;border-bottom:1px solid #dde6e3}td:first-child{overflow-wrap:anywhere}dl{max-width:320px;margin:24px 0 0 auto}dl div{display:flex;justify-content:space-between;padding:6px}dd{margin:0;font-weight:600}.note{background:#fff7df;padding:12px}.scroll{overflow:auto}@media(max-width:500px){main{margin:0;border:0;border-radius:0;padding:16px}table{font-size:12px}}@media print{body{background:white}main{border:0;margin:0;max-width:none}.print-help{display:none}}
  </style></head><body><main>${r.practice ? '<p class="note">PRACTICE RECEIPT — not a tax invoice</p>' : ""}<h1>${e(r.shop.name)}</h1><p>${e(r.shop.address)}<br>${e(r.shop.phone)}</p><small>GSTIN: ${e(r.shop.gstin || "Not registered")} · Drug licence: ${e(r.shop.drugLicenseNo)}</small><h2>${e(r.invoiceNo)}</h2><p>${e(r.date)} · ${e(r.status)}</p><div class="scroll"><table><thead><tr><th>Medicine / batch / expiry</th><th>HSN</th><th>Qty</th><th>MRP</th><th>Amount</th></tr></thead><tbody>${r.items.map((i) => `<tr><td>${e(i.name)}<small>${e(i.batch)} · ${e(i.expiry)}${i.returned ? ` · Returned: ${i.returned}` : ""}</small></td><td>${e(i.hsn)}</td><td>${i.quantity}</td><td>${money(i.mrp)}</td><td>${money(i.total)}</td></tr>`).join("")}</tbody></table></div><dl>${[
    ["Discount", r.discount],
    ["CGST", r.cgst],
    ["SGST", r.sgst],
    ["Round-off", r.roundOff],
    ["Total", r.total],
    ["Returns / refunds", r.refunded],
  ]
    .map(
      ([label, amount]) =>
        `<div><dt>${label}</dt><dd>${money(Number(amount))}</dd></div>`,
    )
    .join(
      "",
    )}</dl><p class="print-help">Use your browser’s Print option to print or save this receipt as a PDF.</p><small>This private link shows only this receipt. Contact the shop for assistance.</small></main></body></html>`;
}
