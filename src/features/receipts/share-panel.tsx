"use client";
import { T } from "@/lib/i18n/provider";

import { useRef, useState } from "react";
import {
  shareReceiptAction,
  revokeReceiptsAction,
  queueReceiptDeliveryAction,
} from "./actions";
export function ShareReceiptPanel({
  saleId,
  canSendSms,
  canSendWhatsapp,
  smsReady,
  whatsappReady,
}: {
  saleId: string;
  canSendSms: boolean;
  canSendWhatsapp: boolean;
  smsReady: boolean;
  whatsappReady: boolean;
}) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState<"SMS" | "WHATSAPP" | "">("");
  const [queued, setQueued] = useState<string[]>([]);
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
              "The customer gets a separate receipt-only page. It has no staff login, navigation or links to this app. Links expire after 24 hours."
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
                setQueued([]);
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
                  setQueued([]);
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
                className="button primary"
                type="button"
                disabled={pending || !!sending || !canSendSms || !smsReady || queued.includes("SMS")}
                onClick={async () => {
                  setSending("SMS");
                  setMessage("");
                  try {
                    const result = await queueReceiptDeliveryAction({
                      saleId,
                      requestId: requestId.current,
                      channel: "SMS",
                    });
                    if (!result.error) setQueued((items) => [...items, "SMS"]);
                    setMessage(result.error || result.success || "");
                  } catch {
                    setMessage("Could not queue the SMS. Try again.");
                  } finally {
                    setSending("");
                  }
                }}
              >
                <T>{queued.includes("SMS") ? "SMS queued" : "Send by SMS"}</T>
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={pending || !!sending || !canSendWhatsapp || !whatsappReady || queued.includes("WHATSAPP")}
                onClick={async () => {
                  setSending("WHATSAPP");
                  setMessage("");
                  try {
                    const result = await queueReceiptDeliveryAction({
                      saleId,
                      requestId: requestId.current,
                      channel: "WHATSAPP",
                    });
                    if (!result.error) setQueued((items) => [...items, "WHATSAPP"]);
                    setMessage(result.error || result.success || "");
                  } catch {
                    setMessage("Could not queue the WhatsApp message. Try again.");
                  } finally {
                    setSending("");
                  }
                }}
              >
                <T>{queued.includes("WHATSAPP") ? "WhatsApp queued" : "Send by WhatsApp"}</T>
              </button>
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
            {(!canSendSms || !canSendWhatsapp || !smsReady || !whatsappReady) && (
              <small>
                <T>{"Sending needs an active customer, channel consent and an enabled provider."}</T>
              </small>
            )}
          </>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
