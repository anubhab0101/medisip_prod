"use client";
import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { useEffect, useRef, useState } from "react";
import { searchCatalog } from "./actions";
import type { CatalogItem } from "./types";
export function MedicineSearch({
  onAdd,
}: {
  onAdd: (medicine: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    setError("");
    if (!query.trim()) {
      setItems([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchCatalog(query);
        if (active) setItems(found);
      } catch {
        if (active) setError("Search is unavailable. Check your connection.");
      } finally {
        if (active) setLoading(false);
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function add(item: CatalogItem) {
    onAdd(item);
    setQuery("");
    setItems([]);
    searchRef.current?.focus();
  }
  return (
    <div className="medicine-search">
      <label>
        <T>{"Find medicine "}</T>
        <small>F2</small>
        <LocalizedInput
          ref={searchRef}
          autoFocus
          value={query}
          placeholder="Name, ingredient or scan barcode"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && items[0]) {
              e.preventDefault();
              add(items[0]);
            }
          }}
        />
      </label>
      {loading && (
        <p role="status">
          <T>{"Searching…"}</T>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {query && items.length > 0 && (
        <ul className="search-results">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => add(item)}
                disabled={
                  !item.batches.some((b) => b.qtyOnHand > b.qtyReserved)
                }
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.genericName}</small>
                </span>
                <span>
                  {item.batches.reduce(
                    (n, b) => n + b.qtyOnHand - b.qtyReserved,
                    0,
                  )}{" "}
                  <T>{"available"}</T>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && !loading && !items.length && !error && (
        <p>
          <T>{"No matching medicines."}</T>
        </p>
      )}
    </div>
  );
}
