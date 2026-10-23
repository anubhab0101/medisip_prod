"use client";
import { useState } from "react";
import { prepareOfflineAction } from "./actions";
export function OfflinePrepare({
  batches,
}: {
  batches: { id: string; name: string; available: number }[];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [identity] = useState(() => ({
    deviceId: crypto.randomUUID(),
    secret: btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", ""),
  }));
  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (localStorage.getItem("medishop.offline.active")) {
      window.location.href = "/offline-shell/index.html";
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await prepareOfflineAction({
        ...identity,
        name: String(form.get("name")),
        items: form
          .getAll("batchId")
          .map((id, i) => ({
            batchId: String(id),
            quantity: Number(form.getAll("quantity")[i]),
          }))
          .filter((i) => i.quantity > 0),
      });
      if (result.error) setError(result.error);
      else if (result.bundle) {
        localStorage.setItem(
          "medishop.offline.handoff",
          JSON.stringify(result.bundle),
        );
        localStorage.setItem("medishop.offline.active", identity.deviceId);
        window.location.href = "/offline-shell/index.html";
      }
    } catch {
      setError(
        "Could not prepare this counter. Retry here with the same selection; do not clear this page until confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        <a className="button secondary" href="/offline-shell/index.html">
          Open existing offline counter
        </a>
      </p>
      <form onSubmit={prepare} className="stack">
        <fieldset disabled={busy}>
          <label>
            Counter name
            <input
              name="name"
              maxLength={100}
              defaultValue="This counter"
              required
            />
          </label>
          <p>
            Enter quantities for up to 20 batches. These units become
            unavailable to other counters until sold or released.
          </p>
          {batches.map((b) => (
            <label key={b.id}>
              {b.name} · {b.available} available
              <input type="hidden" name="batchId" value={b.id} />
              <input
                aria-label={`Reserve ${b.name}`}
                type="number"
                name="quantity"
                min="0"
                max={b.available}
                defaultValue="0"
              />
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Preparing…" : "Reserve stock & open counter"}
        </button>
      </form>
    </>
  );
}
