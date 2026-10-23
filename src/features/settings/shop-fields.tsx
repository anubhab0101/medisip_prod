import { T } from "@/lib/i18n/provider";
import type { Branch } from "@prisma/client";
export function ShopFields({ branch }: { branch: Branch }) {
  return (
    <div className="fields">
      <label>
        <T>{"Shop name"}</T>
        <input
          name="name"
          defaultValue={branch.name}
          required
          maxLength={150}
        />
      </label>
      <label>
        <T>{"Phone"}</T>
        <input
          name="phone"
          defaultValue={branch.phone}
          required
          minLength={10}
          maxLength={20}
        />
      </label>
      <label>
        <T>{"Address"}</T>
        <textarea
          name="address"
          defaultValue={branch.address}
          required
          minLength={5}
          maxLength={1000}
        />
      </label>
      <label>
        GSTIN
        <input name="gstin" defaultValue={branch.gstin} maxLength={30} />
        <small>
          <T>{"Leave blank if your shop is not GST registered."}</T>
        </small>
      </label>
      <label>
        <T>{"Drug licence no."}</T>
        <input
          name="drugLicenseNo"
          defaultValue={branch.drugLicenseNo}
          required
          maxLength={100}
        />
      </label>
      <label>
        <T>{"Invoice prefix"}</T>
        <input
          name="invoicePrefix"
          defaultValue={branch.invoicePrefix}
          required
          pattern="[A-Z0-9-]{1,12}"
        />
        <small>
          <T>{"For example: INV or MAIN."}</T>
        </small>
      </label>
    </div>
  );
}
