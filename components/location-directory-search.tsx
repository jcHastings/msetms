"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { directoryHref } from "@/lib/directory-page";
import { formatLocationAddress, LOCATION_SUGGEST_LIMIT } from "@/lib/locations";
import { searchLocationsAction } from "@/lib/search-actions";
import type { LocationPickerHit } from "@/lib/queries";

const SUGGEST_DEBOUNCE_MS = 200;

export function LocationDirectorySearch({
  q,
  extra,
  children,
}: {
  q: string;
  extra?: Record<string, string>;
  children?: ReactNode;
}) {
  const router = useRouter();
  const listId = useId().replace(/:/g, "") + "-location-suggest";
  const [query, setQuery] = useState(q);
  const [debounced, setDebounced] = useState(q);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [result, setResult] = useState<{ query: string; items: LocationPickerHit[] }>({ query: "", items: [] });

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query), SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const trimmed = debounced.trim();
    if (trimmed.length < 1) return;
    let cancelled = false;
    void searchLocationsAction(trimmed)
      .then((next) => {
        if (!cancelled) setResult({ query: trimmed, items: next.slice(0, LOCATION_SUGGEST_LIMIT) });
      })
      .catch(() => {
        if (!cancelled) setResult({ query: trimmed, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const waiting = query.trim() !== debounced.trim() || (debounced.trim() !== "" && result.query !== debounced.trim());
  const rows = waiting || !debounced.trim() ? [] : result.items;

  function close() {
    setOpen(false);
    setHighlight(0);
  }

  function choose(row: LocationPickerHit) {
    setQuery(row.name);
    close();
    router.push(`/locations/${row.id}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!open || !rows.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && rows[highlight]) {
      event.preventDefault();
      choose(rows[highlight]);
    }
  }

  const activeId = open && rows[highlight] ? `${listId}-opt-${rows[highlight].id}` : undefined;

  return (
    <form className="load-list-search px-4 pt-3" method="get" action="/locations" data-directory-search="">
      {extra
        ? Object.entries(extra).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null,
          )
        : null}
      <div className="field relative min-w-56 flex-1">
        <label htmlFor="locations-q">Find a location</label>
        <input
          id="locations-q"
          name="q"
          role="combobox"
          aria-expanded={open && rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          value={query}
          placeholder="Name or city"
          className="location-suggest-input"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
        />
        {open && query.trim() ? (
          <ul id={listId} role="listbox" className="location-suggest-menu absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md text-sm" data-location-suggest="">
            {waiting ? (
              <li className="px-3 py-2 text-sm text-[#3d4f61]" role="status">
                Searching locations…
              </li>
            ) : rows.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[#3d4f61]">No kept locations match that name or city.</li>
            ) : (
              rows.map((row, index) => {
                const address = formatLocationAddress(row);
                const active = index === highlight;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      id={`${listId}-opt-${row.id}`}
                      role="option"
                      aria-selected={active}
                      className={`location-suggest-option w-full px-3 py-2 text-left ${active ? "is-active" : ""}`}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => choose(row)}
                    >
                      <div className="location-suggest-name font-semibold">{row.name}</div>
                      {row.matched_alias ? (
                        <div className="location-suggest-address text-sm">also known as {row.matched_alias}</div>
                      ) : null}
                      {address ? <div className="location-suggest-address text-sm">{address}</div> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
      <button className="btn btn-secondary" type="submit">
        Search
      </button>
      {q ? (
        <Link href={directoryHref("/locations", "", 1, extra)} className="btn btn-ghost">
          Clear
        </Link>
      ) : null}
      {children}
    </form>
  );
}
