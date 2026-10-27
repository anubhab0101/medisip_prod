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
const money = (value: number) => {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  return `${negative ? "−" : ""}₹${(absolute / 100n).toLocaleString("en-IN")}.${String(absolute % 100n).padStart(2, "0")}`;
};
export function renderReceipt(raw: unknown) {
  const r = receiptSchema.parse(raw),
    e = escapeHtml;
  const summary = [
    ["Discount", r.discount],
    ["CGST", r.cgst],
    ["SGST", r.sgst],
    ["Round-off", r.roundOff],
    ["Returns / refunds", r.refunded],
  ] as const;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>Receipt ${e(r.invoiceNo)}</title><style>
  :root{color-scheme:light;--page:#f2f6f4;--paper:#fff;--ink:#172722;--muted:#5b6b65;--line:#dce5e0;--brand:#0d755f;--soft:#e9f4f0;--warn:#fff4d8}*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.receipt{width:min(100% - 32px,720px);margin:32px auto;padding:28px;border:1px solid var(--line);border-radius:16px;background:var(--paper);box-shadow:0 8px 28px rgb(22 43 34 / 6%)}.practice{margin:-28px -28px 22px;padding:11px 28px;border-radius:16px 16px 0 0;background:var(--warn);color:#6c4c05;font-size:13px;font-weight:650}.receipt-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--line)}h1{margin:0 0 6px;font-size:24px;line-height:1.2;letter-spacing:-.035em;overflow-wrap:anywhere}.shop-details,.invoice-meta p{margin:3px 0;color:var(--muted);font-size:13px;overflow-wrap:anywhere}.invoice-meta{text-align:right}.invoice-id{font-size:15px!important;color:var(--ink)!important;font-weight:700}.status{display:inline-flex;align-items:center;min-height:26px;margin-top:8px;padding:3px 9px;border-radius:999px;background:var(--soft);color:#075f4e;font-size:11px;font-weight:700}.business-details{display:flex;flex-wrap:wrap;gap:5px 16px;margin:12px 0 20px;color:var(--muted);font-size:11px}.section-title{margin:0 0 9px;font-size:15px}.items{overflow:auto;border:1px solid var(--line);border-radius:10px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f7f9f8;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}th,td{padding:12px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}td:first-child{min-width:190px;font-weight:600;overflow-wrap:anywhere}td small{display:block;margin-top:3px;color:var(--muted);font-size:10px;font-weight:400}th:nth-child(n+3),td:nth-child(n+3){text-align:right;white-space:nowrap}.totals{width:min(100%,350px);margin:18px 0 0 auto}.totals-row{display:flex;justify-content:space-between;gap:20px;padding:6px 2px;color:var(--muted);font-size:13px}.totals-row strong{color:var(--ink);font-weight:600}.total{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:7px;padding:13px 14px;border-radius:10px;background:var(--soft);color:#075f4e;font-size:14px;font-weight:700}.total strong{font-size:20px;letter-spacing:-.03em}.receipt-foot{display:flex;justify-content:space-between;gap:14px;margin-top:20px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}.receipt-foot p{margin:0}.print-help{margin:14px 0 0;color:var(--muted);font-size:12px;text-align:center}@media(max-width:560px){body{background:#fff}.receipt{width:100%;min-height:100vh;margin:0;padding:18px 14px;border:0;border-radius:0;box-shadow:none}.practice{margin:-18px -14px 18px;padding:10px 14px;border-radius:0}.receipt-head{gap:10px}.receipt-head h1{font-size:20px}.invoice-meta p{font-size:11px}.business-details{display:grid;gap:4px}.items{border:0;overflow:visible}table,tbody{display:block;width:100%}thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}tbody{display:grid;gap:8px}tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px 8px;padding:10px;border:1px solid var(--line);border-radius:10px}td{display:block;padding:0;border:0!important;text-align:left!important;white-space:normal!important;font-size:12px}td:first-child{grid-column:1/-1;min-width:0;font-size:13px}td:nth-child(2)::before{content:"HSN ";color:var(--muted);font-size:9px}td:nth-child(3)::before{content:"Qty ";color:var(--muted);font-size:9px}td:nth-child(4)::before{content:"MRP ";color:var(--muted);font-size:9px}td:nth-child(5)::before{content:"Amount ";color:var(--muted);font-size:9px}.totals{width:100%}.receipt-foot{display:grid;gap:5px}}@media print{body{background:#fff}.receipt{width:auto;max-width:none;margin:0;padding:0;border:0;border-radius:0;box-shadow:none}.practice{margin:0 0 14px;padding:8px;border-radius:0}.print-help{display:none}.items{overflow:visible}table{font-size:10px}th,td{padding:7px 6px}.receipt-foot{break-inside:avoid}}
  </style></head><body><main class="receipt">${r.practice ? '<p class="practice">PRACTICE RECEIPT · Not a tax invoice</p>' : ""}<header class="receipt-head"><div><h1>${e(r.shop.name)}</h1><p class="shop-details">${e(r.shop.address)}<br>${e(r.shop.phone)}</p></div><div class="invoice-meta"><p class="invoice-id">${e(r.invoiceNo)}</p><p>${e(r.date)}</p><span class="status">${e(r.status)}</span></div></header><div class="business-details"><span>GSTIN: ${e(r.shop.gstin || "Not registered")}</span><span>Drug licence: ${e(r.shop.drugLicenseNo || "Not provided")}</span></div><h2 class="section-title">Items</h2><div class="items"><table><thead><tr><th>Medicine / batch</th><th>HSN</th><th>Qty</th><th>MRP</th><th>Amount</th></tr></thead><tbody>${r.items.map((i) => `<tr><td>${e(i.name)}<small>${e(i.batch)} · Expires ${e(i.expiry)}${i.returned ? ` · Returned: ${i.returned}` : ""}</small></td><td>${e(i.hsn || "—")}</td><td>${i.quantity}</td><td>${money(i.mrp)}</td><td>${money(i.total)}</td></tr>`).join("")}</tbody></table></div><section class="totals" aria-label="Receipt totals">${summary
    .map(([label, amount]) => `<div class="totals-row"><span>${label}</span><strong>${money(amount)}</strong></div>`)
    .join("")}<div class="total"><span>Bill total</span><strong>${money(r.total)}</strong></div></section><footer class="receipt-foot"><p>This private link shows only this receipt.</p><p>Need help? Contact ${e(r.shop.phone)}.</p></footer><p class="print-help">To print or save a copy, use your browser’s Print option.</p></main></body></html>`;
}
