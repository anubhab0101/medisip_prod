import { T } from "@/lib/i18n/provider";
import { ActionForm } from "@/components/shared/action-form";
import { loyaltySettingsAction } from "./actions";
export function LoyaltySettings({
  branch,
}: {
  branch: {
    loyaltyEnabled: boolean;
    loyaltyEarnPaise: number;
    loyaltyRedeemPaise: number;
  };
}) {
  return (
    <details className="panel disclosure">
      <summary>
        <T>{"Loyalty points"}</T>
      </summary>
      <ActionForm action={loyaltySettingsAction} label="Save loyalty settings">
        <label className="checkbox">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={branch.loyaltyEnabled}
          />
          <T>{"Enable loyalty points"}</T>
        </label>
        <div className="fields">
          <label>
            <T>{"Spend to earn one point (₹)"}</T>
            <input
              name="earn"
              defaultValue={(branch.loyaltyEarnPaise / 100).toFixed(2)}
              required
            />
          </label>
          <label>
            <T>{"Discount per redeemed point (₹)"}</T>
            <input
              name="redeem"
              defaultValue={(branch.loyaltyRedeemPaise / 100).toFixed(2)}
              required
            />
          </label>
        </div>
        <p>
          <T>
            {
              "Points are earned on the final bill total and redeemed as a bill discount. Returns adjust earned and redeemed points in proportion to the returned items’ original value. A negative balance must be earned back before further redemption."
            }
          </T>
        </p>
      </ActionForm>
    </details>
  );
}
