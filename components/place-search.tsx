"use client";

import { useState } from "react";
import { placeDetailsAction, searchPlacesAction } from "@/lib/places-actions";
import type { PlaceDetails } from "@/lib/places";

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

  if (!enabled) {
    return <p className="text-xs text-slate-500">Add GOOGLE_MAPS_API_KEY to .env to enable address search.</p>;
  }

  async function onSearch() {
    setPending(true);
    setError("");
    try {
      setResults(await searchPlacesAction(query));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
    }
    setPending(false);
  }

  async function onSelect(placeId: string) {
    setPending(true);
    setError("");
    try {
      onPick(await placeDetailsAction(placeId));
      setResults([]);
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="btn btn-secondary" type="button" disabled={pending || query.trim().length < 3} onClick={onSearch}>
          {pending ? "…" : "Search"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
          {results.map((item) => (
            <li key={item.placeId}>
              <button className="w-full px-3 py-2 text-left hover:bg-slate-50" type="button" onClick={() => onSelect(item.placeId)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
