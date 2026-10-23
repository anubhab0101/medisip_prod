import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";
import type { Medicine, BranchMedicine } from "@prisma/client";
export function MedicineFields({
  medicine,
  settings,
}: {
  medicine?: Medicine;
  settings?: BranchMedicine;
}) {
  return (
    <div className="fields">
      <label>
        <T>{"Name"}</T>
        <input
          name="name"
          defaultValue={medicine?.name}
          required
          maxLength={150}
        />
      </label>
      <label>
        <T>{"Ingredient / salt"}</T>
        <input
          name="genericName"
          defaultValue={medicine?.genericName}
          maxLength={150}
        />
      </label>
      <label>
        <T>{"Strength"}</T>
        <LocalizedInput
          name="strength"
          defaultValue={medicine?.strength}
          placeholder="500 mg"
        />
      </label>
      <label>
        <T>{"Form"}</T>
        <select name="dosageForm" defaultValue={medicine?.dosageForm}>
          <option value="tablet">
            <T>{"Tablet"}</T>
          </option>
          <option value="capsule">
            <T>{"Capsule"}</T>
          </option>
          <option value="syrup">
            <T>{"Syrup"}</T>
          </option>
          <option value="injection">
            <T>{"Injection"}</T>
          </option>
          <option value="cream">
            <T>{"Cream"}</T>
          </option>
          <option value="other">
            <T>{"Other"}</T>
          </option>
        </select>
      </label>
      <label>
        <T>{"Pack size"}</T>
        <input
          name="packSize"
          defaultValue={medicine?.packSize ?? "1 strip"}
          required
        />
      </label>
      <label>
        <T>{"Manufacturer"}</T>
        <input name="manufacturer" defaultValue={medicine?.manufacturer} />
      </label>
      <label>
        <T>{"GST rate"}</T>
        <select name="gstBasisPoints" defaultValue={medicine?.gstBasisPoints}>
          {[0, 500, 1200, 1800, 2800].map((rate) => (
            <option key={rate} value={rate}>
              {rate / 100}%
            </option>
          ))}
        </select>
        <small>
          <T>{"Confirm the applicable rate for this medicine."}</T>
        </small>
      </label>
      <label>
        HSN
        <input name="hsn" defaultValue={medicine?.hsn} />
      </label>
      <label>
        <T>{"Prescription category"}</T>
        <select name="schedule" defaultValue={medicine?.schedule}>
          {["NONE", "H", "H1", "X"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        <T>{"Barcode"}</T>
        <input name="barcode" defaultValue={medicine?.barcode ?? ""} />
      </label>
      <label>
        <T>{"Rack"}</T>
        <input name="rack" defaultValue={settings?.rack} />
      </label>
      <label>
        <T>{"Low-stock alert below"}</T>
        <input
          name="reorderLevel"
          type="number"
          min="0"
          defaultValue={settings?.reorderLevel ?? 10}
          required
        />
      </label>
    </div>
  );
}
