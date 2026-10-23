import { T } from "@/lib/i18n/provider";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { shopDate } from "@/lib/date";
import { PageTitle } from "@/components/shared/page";
import { ActionForm } from "@/components/shared/action-form";
import { shopAction } from "@/features/settings/actions";
import { ShopFields } from "@/features/settings/shop-fields";
import { shopSchema } from "@/features/settings/shop-schema";
import { MedicineFields } from "@/features/stock/medicine-fields";
import { medicineAction } from "@/features/stock/actions";
import { supplierAction } from "@/features/suppliers/actions";
import { PurchaseForm } from "@/features/stock/purchase-form";

export default async function Setup() {
  const ctx = await context(Permission.SETTINGS);
  const branchId = ctx.branch.id;
  const [medicines, suppliers, stock] = await Promise.all([
    db().medicine.findMany({
      where: {
        active: true,
        branchSettings: { some: { branchId, active: true } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db().supplier.findMany({
      where: { branchId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db().$queryRaw<
      { count: bigint }[]
    >`SELECT COUNT(*) AS count FROM Batch b JOIN Medicine m ON m.id=b.medicineId JOIN BranchMedicine bm ON bm.medicineId=b.medicineId AND bm.branchId=b.branchId WHERE b.branchId=${branchId} AND b.qtyOnHand>b.qtyReserved AND b.expiryDate>=${shopDate()} AND m.active=1 AND bm.active=1`,
  ]);
  const step = !shopSchema.safeParse(ctx.branch).success
    ? 0
    : !medicines.length
      ? 1
      : !Number(stock[0].count)
        ? 2
        : 3;
  const labels = [
    "Shop details",
    "First medicine",
    "Opening stock",
    "Ready to bill",
  ];
  return (
    <>
      <PageTitle
        title="Set up your shop"
        description="Your progress is saved as you go. You can leave and return anytime."
        action={
          <Link className="button secondary" href="/dashboard">
            <T>{"Home"}</T>
          </Link>
        }
      />
      <ol className="setup-steps" aria-label="Setup progress">
        {labels.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined}>
            <strong>{index < step ? "✓" : index + 1}</strong> {label}
          </li>
        ))}
      </ol>
      <section className="panel" key={step}>
        <h2>
          <T>{"Step "}</T>
          {step + 1}
          <T>{" of 4 · "}</T>
          {labels[step]}
        </h2>
        {step === 0 && (
          <>
            <p>
              <T>{"Enter your real shop details. These appear on receipts."}</T>
            </p>
            <ActionForm action={shopAction} label="Save and continue">
              <ShopFields branch={ctx.branch} />
            </ActionForm>
          </>
        )}
        {step === 1 && (
          <>
            <p>
              <T>
                {
                  "Add one medicine to get started. This creates the catalogue entry; the next step adds its quantity and price."
                }
              </T>
            </p>
            <ActionForm
              action={medicineAction}
              label="Add medicine and continue"
            >
              <MedicineFields />
            </ActionForm>
            <p>
              <T>{"Have a list already?"}</T>{" "}
              <Link className="text-link" href="/medicines/import">
                <T>{"Import CSV / Excel"}</T>
              </Link>
              <T>{", then return to this setup page."}</T>
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <p>
              <T>
                {
                  "Enter an actual supplier bill or opening-stock record. Use the batch, expiry, quantity, purchase price and MRP printed on your stock."
                }
              </T>
            </p>
            {!suppliers.length ? (
              <>
                <h3>
                  <T>{"Add your supplier first"}</T>
                </h3>
                <ActionForm
                  action={supplierAction}
                  label="Save supplier and continue"
                >
                  <div className="fields">
                    <label>
                      <T>{"Name"}</T>
                      <input name="name" required />
                    </label>
                    <label>
                      <T>{"Phone"}</T>
                      <input name="phone" />
                    </label>
                    <label>
                      GSTIN
                      <input name="gstin" />
                    </label>
                  </div>
                </ActionForm>
              </>
            ) : (
              <PurchaseForm
                suppliers={suppliers}
                medicines={medicines}
                date={shopDate()}
                operationId={randomUUID()}
              />
            )}
          </>
        )}
        {step === 3 && (
          <>
            <p>
              <T>
                {
                  "Your shop details, medicines and available stock are ready. Create a bill using your actual sale details."
                }
              </T>
            </p>
            <Link className="button" href="/billing">
              <T>{"Create your first bill"}</T>
            </Link>
            <p>
              <T>{"Next, you can"}</T>{" "}
              <Link className="text-link" href="/settings/staff">
                <T>{"add staff"}</T>
              </Link>
              ,{" "}
              <Link className="text-link" href="/medicines">
                <T>{"add more medicines"}</T>
              </Link>{" "}
              <T>{"or read"}</T>{" "}
              <Link className="text-link" href="/help">
                <T>{"Quick help"}</T>
              </Link>
              .
            </p>
          </>
        )}
      </section>
      <p>
        <Link className="text-link" href="/settings">
          <T>{"Edit shop details"}</T>
        </Link>
      </p>
    </>
  );
}
