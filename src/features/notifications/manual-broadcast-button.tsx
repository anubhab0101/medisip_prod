"use client";
import { T } from "@/lib/i18n/provider";

import { useState } from "react";
import { openBroadcastAction } from "./broadcast-actions";
export function ManualBroadcastButton({ logId }: { logId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div>
      {url ? (
        <a
          className="text-link"
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={() => setUrl("")}
        >
          <T>{"Open message to send"}</T>
        </a>
      ) : (
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              const result = await openBroadcastAction(logId);
              setUrl(result.id ?? "");
              setError(result.error);
            } catch {
              setError("Could not prepare this message. Try again.");
            } finally {
              setPending(false);
            }
          }}
        >
          <T>{pending ? "Checking…" : "Prepare message"}</T>
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
