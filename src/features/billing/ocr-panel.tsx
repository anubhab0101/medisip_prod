"use client";
import { LocalizedTextarea, LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { useEffect, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { searchCatalog } from "./actions";
import type { CatalogItem } from "./types";
export function OcrPanel({
  onAdd,
}: {
  onAdd: (medicine: CatalogItem) => void;
}) {
  const [text, setText] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const worker = useRef<Worker | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const engine = worker.current;
      worker.current = null;
      void engine?.terminate();
    };
  }, []);
  async function read(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPG or WebP image smaller than 8 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setText("");
    setItems([]);
    setReviewed(false);
    setProgress("Loading reader…");
    try {
      const { createWorker } = await import("tesseract.js");
      const engine = await createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        gzip: false,
        workerBlobURL: false,
        logger: (status) =>
          mounted.current &&
          setProgress(`${status.status} ${Math.round(status.progress * 100)}%`),
      });
      if (!mounted.current) {
        await engine.terminate();
        return;
      }
      worker.current = engine;
      const result = await engine.recognize(file);
      if (!mounted.current) return;
      setText(result.data.text);
      setProgress("Text read. Check it carefully before choosing medicines.");
    } catch {
      setError(
        "Could not read this image. Try a clear, straight photo of printed English text, or enter medicines manually.",
      );
    } finally {
      const engine = worker.current;
      worker.current = null;
      await engine?.terminate();
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <details className="panel disclosure">
      <summary>
        <T>{"Read a printed prescription"}</T>
      </summary>
      <div className="stack">
        <p>
          <T>
            {
              "Printed English text only. The image is read on this device and is not uploaded. Check the original prescription; handwriting and unclear text may be read incorrectly."
            }
          </T>
        </p>
        <label>
          <T>{"Prescription image"}</T>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => void read(e.target.files?.[0])}
          />
        </label>
        {progress && <p role="status">{progress}</p>}
        {text && (
          <>
            <label>
              <T>{"Review extracted text"}</T>
              <LocalizedTextarea
                aria-label="Review extracted text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setReviewed(false);
                }}
                rows={6}
              />
            </label>
            <label>
              <T>{"Medicine to find"}</T>
              <LocalizedInput
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setItems([]);
                  setReviewed(false);
                }}
                maxLength={100}
                placeholder="Enter a medicine name from the reviewed text"
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !query.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setItems(await searchCatalog(query));
                } catch {
                  setError("Could not search medicines.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <T>{"Find medicine"}</T>
            </button>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <T>
                {
                  "I checked the original prescription, medicine and strength. I will confirm quantity in the bill."
                }
              </T>
            </label>
            {items.map((item) => (
              <button
                className="button secondary"
                type="button"
                key={item.id}
                disabled={
                  !reviewed ||
                  busy ||
                  !item.batches.some((b) => b.qtyOnHand > b.qtyReserved)
                }
                onClick={() => {
                  onAdd(item);
                  setItems([]);
                  setQuery("");
                  setReviewed(false);
                }}
              >
                {item.name}
                <T>{" — add 1, then check quantity"}</T>
              </button>
            ))}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
