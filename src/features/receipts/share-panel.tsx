"use client";
import { T } from "@/lib/i18n/provider";

import { useRef, useState } from "react";
import { shareReceiptAction, revokeReceiptsAction } from "./actions";
export function ShareReceiptPanel({ saleId }: { saleId: string }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  return (
    <details className="panel disclosure no-print">
      <summary>
        <T>{"Share receipt securely"}</T>
      </summary>
      <div className="stack">
        <p>
          <T>
            {
              "The customer gets a separate receipt-only page. It has no staff login, navigation or links to this app. Links expire in 30 days."
            }
          </T>
        </p>
        <div className="inline">
          <button
            className="button secondary"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setMessage("");
              try {
                const result = await shareReceiptAction({
                  saleId,
                  requestId: requestId.current,
                });
                setUrl(result.id ?? "");
                setMessage(result.error || result.success || "");
              } catch {
                setMessage("Could not create the receipt link. Try again.");
              } finally {
                setPending(false);
              }
            }}
          >
            <T>{"Create receipt link"}</T>
          </button>
          <button
            className="text-button"
            disabled={pending}
            onClick={async () => {
              if (
                !window.confirm(
                  "Disable every shared link for this bill? Customers will need a new receipt link.",
                )
              )
                return;
              setPending(true);
              try {
                const result = await revokeReceiptsAction(saleId);
                setMessage(result.error || result.success || "");
                if (!result.error) {
                  setUrl("");
                  requestId.current = crypto.randomUUID();
                }
              } catch {
                setMessage("Could not disable links. Try again.");
              } finally {
                setPending(false);
              }
            }}
          >
            <T>{"Disable shared links"}</T>
          </button>
        </div>
        {url && (
          <>
            <label>
              <T>{"Customer receipt link"}</T>
              <input readOnly value={url} onFocus={(e) => e.target.select()} />
            </label>
            <div className="inline">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setMessage(
                      "Receipt link copied. Paste it into the customer’s message.",
                    );
                  } catch {
                    setMessage("Select and copy the link above.");
                  }
                }}
              >
                <T>{"Copy link"}</T>
              </button>
              <a
                className="text-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <T>{"Preview customer receipt"}</T>
              </a>
            </div>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
