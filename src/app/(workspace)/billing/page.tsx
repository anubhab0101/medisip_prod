import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { PageTitle } from "@/components/shared/page";
import { BillingForm } from "@/features/billing/billing-form";
export default async function BillingPage() {
  const ctx = await context(Permission.BILL);
  const customers = await db().customer.findMany({
    where: { branchId: ctx.branch.id, active: true },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  return (
    <>
      <PageTitle
        title="New bill"
        description="Find medicine → check quantity → save."
        action={
          <Link className="button secondary" href="/offline">
            <T>{"Offline counter"}</T>
          </Link>
        }
      />
      <BillingForm
        key={`${ctx.branch.id}.${ctx.user.id}`}
        customers={customers}
        loyalty={{
          enabled: ctx.branch.loyaltyEnabled,
          rate: ctx.branch.loyaltyRedeemPaise,
        }}
        branchId={ctx.branch.id}
        userId={ctx.user.id}
      />
    </>
  );
}
