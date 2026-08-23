"use client";

import { useEffect, useState } from "react";
import { placeDetailsAction, searchPlacesAction } from "@/lib/places-actions";
import type { PlaceDetails } from "@/lib/places-shared";

export function PlaceSearch({
  enabled,
  onPick,
  placeholder = "Search Google Places",
}: {
  enabled: boolean;
  onPick: (place: PlaceDetails) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ placeId: string; label: string }>>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setPending(true);
      setError("");
      void searchPlacesAction(trimmed)
        .then((next) => setResults(next))
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : "Search failed.");
        })
        .finally(() => setPending(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [enabled, query]);

  if (!enabled) {
    return <p className="text-xs text-slate-500">Add a key to enable search.</p>;
  }

  async function onSelect(placeId: string) {
    setPending(true);
    setError("");
    try {
      onPick(await placeDetailsAction(placeId));
      setResults([]);
      setQuery("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Place could not be loaded.");
    }
    setPending(false);
  }

  return (
    <div className="md:col-span-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="self-center text-xs text-slate-400">{pending ? "Searching…" : ""}</span>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
          {results.map((item) => (
            <li key={item.placeId}>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-50"
                type="button"
                onClick={() => onSelect(item.placeId)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
