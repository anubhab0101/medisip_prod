import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission, can } from "@/lib/permissions";
import { ReturnForm } from "@/features/billing/return-form";
import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { PrintButton } from "@/components/shared/print-button";
import { ShareReceiptPanel } from "@/features/receipts/share-panel";
import { DeliveryForm } from "@/features/delivery/create-form";
const shopSchema = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  gstin: z.string(),
  drugLicenseNo: z.string(),
});
export default async function Invoice({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await context(Permission.BILL);
  const { id } = await params;
  const sale = await db().sale.findFirst({
    where: { id, branchId: ctx.branch.id },
    include: { items: true, payments: true, returns: true, customer: true },
  });
  if (!sale) notFound();
  const shop = shopSchema.parse(sale.shopSnapshot);
  return (
    <>
      <div className="page-title no-print">
        <h1>
          <T>{"Bill saved"}</T>
        </h1>
        <div className="inline">
          <PrintButton disabled={ctx.branch.demo} receipt />
          {!ctx.branch.demo && (
            <a
              className="button secondary"
              download
              href={`/api/bills/${sale.id}/pdf`}
            >
              <T>{"Download PDF"}</T>
            </a>
          )}
          <Link className="button secondary" href="/billing">
            <T>{"New bill"}</T>
          </Link>
        </div>
      </div>
      {ctx.branch.demo && (
        <p className="notice no-print">
          <T>{"Printing is disabled in practice mode."}</T>
        </p>
      )}
      <article className="panel invoice">
        <p>
          <T>{"Status: "}</T>
          {sale.status}
        </p>
        <h2>{shop.name}</h2>
        <p>
          {shop.address}
          <br />
          {shop.phone}
        </p>
        <p>
          <T>{"GSTIN: "}</T>
          {shop.gstin || "Not registered"}
          <T>{" · Drug licence:"}</T> {shop.drugLicenseNo}
        </p>
        <hr />
        <div className="page-title">
          <strong>{sale.invoiceNo}</strong>
          <span>{shopDate(sale.createdAt)}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Medicine / batch / expiry"}</T>
                </th>
                <th>HSN</th>
                <th>
                  <T>{"Qty"}</T>
                </th>
                <th>MRP</th>
                <th>GST</th>
                <th>
                  <T>{"Amount"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    <small>
                      {item.batchNo} ·{" "}
                      {item.expiryDate.toISOString().slice(0, 7)}
                    </small>
                  </td>
                  <td data-label="HSN">{item.hsn}</td>
                  <td data-label="Qty">{item.quantity}</td>
                  <td data-label="MRP">{formatMoney(item.unitPricePaise)}</td>
                  <td data-label="GST">{item.gstBasisPoints / 100}%</td>
                  <td data-label="Amount">{formatMoney(item.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="totals">
          <div>
            <span>
              <T>{"Discount"}</T>
            </span>
            <strong>{formatMoney(sale.discountPaise)}</strong>
          </div>
          <div>
            <span>CGST</span>
            <strong>{formatMoney(sale.cgstPaise)}</strong>
          </div>
          <div>
            <span>SGST</span>
            <strong>{formatMoney(sale.sgstPaise)}</strong>
          </div>
          <div>
            <span>
              <T>{"Round-off"}</T>
            </span>
            <strong>{formatMoney(sale.roundOffPaise)}</strong>
          </div>
          <div className="grand">
            <span>
              <T>{"Total"}</T>
            </span>
            <strong>{formatMoney(sale.totalPaise)}</strong>
          </div>
        </div>
        <p>
          {sale.payments
            .map((p) => `${p.method}: ${formatMoney(p.amountPaise)}`)
            .join(" · ")}
        </p>
        <p>
          <T>{"Get well soon."}</T>
        </p>
      </article>
      <ShareReceiptPanel
        saleId={sale.id}
        canSendSms={Boolean(sale.customer?.active && sale.customer.consentSms)}
        canSendWhatsapp={Boolean(sale.customer?.active && sale.customer.consentWhatsapp)}
        smsReady={process.env.SMS_SEND_ENABLED === "true" && !ctx.branch.demo}
        whatsappReady={process.env.EVOLUTION_GO_SEND_ENABLED === "true" && !ctx.branch.demo}
      />
      {!["VOID", "RETURNED"].includes(sale.status) && (
        <DeliveryForm saleId={sale.id} />
      )}
      {sale.returns.length > 0 && (
        <section className="panel">
          <h2>
            <T>{"Recorded returns"}</T>
          </h2>
          {sale.returns.map((r) => (
            <p key={r.id}>
              {r.reason}
              <T>{" · Total "}</T>
              {formatMoney(r.amountPaise)}
              <T>{" · Credit reduced"}</T> {formatMoney(r.creditRefundPaise)}
              <T>{" · Refund by "}</T>
              {r.refundMethod}:{" "}
              <strong>{formatMoney(r.cashRefundPaise)}</strong>
            </p>
          ))}
        </section>
      )}
      {can(ctx.role, Permission.RETURN) && (
        <ReturnForm saleId={sale.id} items={sale.items} />
      )}
    </>
  );
}
