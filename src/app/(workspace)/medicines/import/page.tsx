import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { PageTitle } from "@/components/shared/page";
import { ImportForm } from "@/features/stock/import-form";
export default async function ImportMedicines() {
  await context(Permission.MEDICINE_WRITE);
  return (
    <>
      <PageTitle
        title="Import medicines"
        description="Preview first. Nothing is saved until you confirm."
        action={
          <Link href="/medicines" className="button secondary">
            <T>{"Medicines"}</T>
          </Link>
        }
      />
      <section className="panel">
        <ImportForm />
      </section>
    </>
  );
}
