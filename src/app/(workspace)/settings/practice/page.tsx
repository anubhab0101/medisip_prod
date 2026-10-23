import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { ActionForm } from "@/components/shared/action-form";
import { PageTitle } from "@/components/shared/page";
import { practiceAction } from "@/features/settings/practice-actions";
export default async function PracticePage() {
  const { branch } = await context(Permission.SETTINGS);
  return (
    <>
      <PageTitle
        title="Practice safely"
        description="Learn with sample stock in a separate practice shop."
      />
      <section className="panel stack">
        <p>
          <T>
            {
              "Your real shop's medicines, customers and bills stay unchanged. Practice includes three clearly marked sample items with 20 units each and a sample supplier. No customer contacts are added."
            }
          </T>
        </p>
        <p>
          <T>
            {
              "Messages, shared receipts and invoice printing are disabled in practice. Use the shop selector to return to your real shop."
            }
          </T>
        </p>
        {branch.demo && (
          <p>
            <T>
              {
                "Reset creates a fresh practice shop and archives this one. Old practice history is retained, not deleted; it disappears from the active shop selector. Only you receive access to the new practice shop. Sync and close offline counters and receive pending transfers first."
              }
            </T>
          </p>
        )}
        <ActionForm
          key={branch.id}
          action={practiceAction}
          label={branch.demo ? "Reset practice shop" : "Create practice shop"}
        >
          <input type="hidden" name="operationId" value={randomUUID()} />
          <input
            type="hidden"
            name="reset"
            value={branch.demo ? "yes" : "no"}
          />
          <label className="checkbox">
            <input type="checkbox" name="confirmed" required />
            <T>
              {branch.demo
                ? "I understand this practice shop will be archived."
                : "Create a separate practice shop with sample stock."}
            </T>
          </label>
        </ActionForm>
        <Link className="button secondary" href="/billing">
          <T>{"Go to billing"}</T>
        </Link>
      </section>
    </>
  );
}
