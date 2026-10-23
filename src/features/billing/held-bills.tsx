"use client";
import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import {
  holdBillAction,
  listHeldBills,
  resumeHeldAction,
  discardHeldAction,
} from "./held-actions";
import type { BillDraft } from "./draft";
export function HeldBills({
  draft,
  onRestore,
  onHeld,
  busy,
  setBusy,
}: {
  draft: BillDraft;
  onRestore: (draft: BillDraft) => Promise<void>;
  onHeld: () => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
}) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listHeldBills>>>(
    [],
  );
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function refresh() {
    setItems(await listHeldBills());
  }
  useEffect(() => {
    refresh().catch(() => setError("Could not load held bills. Try again."));
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await refresh();
    } catch {
      setError("Could not update the held bill. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel disclosure">
      <summary>
        <T>{"Hold / resume bills"}</T>
        {items.length > 0 ? ` (${items.length})` : ""}
      </summary>
      <div className="stack">
        <p>
          <T>
            {
              "Held bills are private to your sign-in. Stock is not reserved; prices and availability are checked again when resumed."
            }
          </T>
        </p>
        {draft.cart.length > 0 && (
          <div className="toolbar">
            <label>
              <T>{"Hold label"}</T>
              <LocalizedInput
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Customer name or counter note"
                maxLength={100}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !label.trim()}
              onClick={() =>
                run(async () => {
                  const result = await holdBillAction({ label, draft });
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  onHeld();
                  setLabel("");
                  setMessage("Bill held. You can start another bill.");
                })
              }
            >
              <T>{"Hold this bill"}</T>
            </button>
          </div>
        )}
        {!items.length && (
          <p>
            <T>{"No held bills."}</T>
          </p>
        )}
        {items.map((item) => (
          <div className="toolbar" key={item.id}>
            <strong>{item.label}</strong>
            <button
              type="button"
              className="button secondary"
              disabled={busy || draft.cart.length > 0}
              onClick={() =>
                run(async () => {
                  await onRestore(await resumeHeldAction(item.id));
                })
              }
            >
              <T>{"Resume "}</T>
              {item.label}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Discard “${item.label}”? This removes only the saved draft; stock and sales stay unchanged.`,
                  )
                )
                  void run(async () => {
                    const result = await discardHeldAction(item.id);
                    if (result.error) setError(result.error);
                  });
              }}
            >
              <T>{"Discard"}</T>
            </button>
          </div>
        ))}
        {draft.cart.length > 0 && items.length > 0 && (
          <small>
            <T>{"Hold or finish the current bill before resuming another."}</T>
          </small>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
