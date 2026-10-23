"use client";
import { LocalizedSelect } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";

export function PrintButton({
  disabled = false,
  receipt = false,
}: {
  disabled?: boolean;
  receipt?: boolean;
}) {
  const [layout, setLayout] = useState("a4");
  useEffect(() => {
    const reset = () => {
      delete document.body.dataset.printLayout;
      document.getElementById("receipt-page-size")?.remove();
    };
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("afterprint", reset);
      reset();
    };
  }, []);
  return (
    <>
      {receipt && (
        <label className="inline no-print">
          <T>{"Paper"}</T>
          <LocalizedSelect
            aria-label="Print paper size"
            value={layout}
            onChange={(event) => setLayout(event.target.value)}
            disabled={disabled}
          >
            <option value="a4">
              <T>{"A4 / PDF"}</T>
            </option>
            <option value="thermal">
              <T>{"80mm receipt"}</T>
            </option>
          </LocalizedSelect>
        </label>
      )}
      <button
        className="button"
        disabled={disabled}
        onClick={() => {
          if (receipt && layout === "thermal") {
            document.body.dataset.printLayout = "thermal";
            document.getElementById("receipt-page-size")?.remove();
            const style = document.createElement("style");
            style.id = "receipt-page-size";
            style.textContent =
              "@media print { @page { size: auto; margin: 3mm; } }";
            document.head.append(style);
          }
          window.print();
        }}
      >
        <T>{"Print / Save PDF"}</T>
      </button>
      {receipt && layout === "thermal" && (
        <small className="no-print">
          <T>
            {
              "Choose 80mm paper in the printer settings; turn off headers and footers."
            }
          </T>
        </small>
      )}
    </>
  );
}
