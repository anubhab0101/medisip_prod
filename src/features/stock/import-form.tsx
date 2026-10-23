"use client";
import { T } from "@/lib/i18n/provider";

import { useRef, useState, useSyncExternalStore } from "react";
import { parseCsv, toCsv } from "@/lib/csv";
import { importHeaders, type ImportRow } from "./import-schema";
import { previewImportAction, importAction } from "./import-actions";
const subscribe = () => () => {};
function download(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(
    new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ImportForm() {
  // File changes cannot be replayed reliably before the client handler is ready.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [rows, setRows] = useState<ImportRow[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [pending, setPending] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const operation = useRef(crypto.randomUUID());
  const valid = rows.flatMap((r) => (r.data && !r.error ? [r.data] : []));
  async function load(file?: File) {
    if (!file) return;
    setRows([]);
    setError("");
    setMessage("");
    setConfirmed(false);
    operation.current = crypto.randomUUID();
    if (file.size > 2 * 1024 * 1024) {
      setError("Choose a file smaller than 2 MB, with up to 500 medicines.");
      return;
    }
    setPending(true);
    try {
      let values: string[][];
      if (file.name.toLowerCase().endsWith(".csv"))
        values = parseCsv(await file.text());
      else if (file.name.toLowerCase().endsWith(".xlsx")) {
        const { readSheet } = await import("read-excel-file/browser");
        values = (await readSheet(file)).map((row) =>
          row.map((cell) => String(cell ?? "")),
        );
      } else throw new Error("Choose a CSV or XLSX file.");
      if (values.length > 501)
        throw new Error("Split this file into batches of 500 medicines.");
      setRows(await previewImportAction(values));
    } catch {
      setError(
        "Could not read the file. Use the template headers, include at most 500 rows, and check the file format.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="stack">
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          download("medicine-template.csv", [
            importHeaders,
            [
              "Example medicine",
              "Example ingredient",
              "500 mg",
              "tablet",
              "Example manufacturer",
              "",
              "0",
              "1 strip",
              "",
              "NONE",
              "10",
              "A1",
            ],
          ])
        }
      >
        <T>{"Download CSV template"}</T>
      </button>
      <p>
        <T>
          {
            "Fill the template, then upload CSV or XLSX (first sheet). Keep barcodes as text. Confirm medicine details and applicable tax rates before importing. Opening stock is entered through Purchases."
          }
        </T>
      </p>
      <label>
        <T>{"Import file"}</T>
        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={pending || !hydrated}
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </label>
      {rows.length > 0 && (
        <>
          <p>
            {valid.length}
            <T>{" ready · "}</T>
            {rows.length - valid.length}
            <T>{" rows need fixing"}</T>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <T>{"Row"}</T>
                  </th>
                  <th>
                    <T>{"Medicine"}</T>
                  </th>
                  <th>
                    <T>{"Result"}</T>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>{row.data?.name ?? "—"}</td>
                    <td>{row.error || "Ready"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              download("import-errors.csv", [
                ["Row", "Error"],
                ...rows.filter((r) => r.error).map((r) => [r.row, r.error]),
              ])
            }
          >
            <T>{"Download error report"}</T>
          </button>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <T>{"Import only the "}</T>
            {valid.length}
            <T>{" valid medicines shown above; skip rows with errors."}</T>
          </label>
          <button
            className="button"
            disabled={pending || !confirmed || !valid.length}
            onClick={async () => {
              setPending(true);
              try {
                const result = await importAction({
                  operationId: operation.current,
                  rows: valid,
                  confirmed,
                });
                setError(result.error);
                setMessage(result.success ?? "");
                if (!result.error) setRows([]);
              } catch {
                setError(
                  "Import result could not be confirmed. Retry this same import.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Working…" : `Import ${valid.length} medicines`}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </div>
  );
}
