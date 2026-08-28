"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  filterLocationsForPicker,
  formatLocationAddress,
  type LocationPickerRow,
} from "@/lib/locations";
import { placeDetailsAction, searchPlacesAction } from "@/lib/places-actions";
import { matchLocationForPlace, type PlaceDetails, type PlaceSuggestion } from "@/lib/places-shared";

const RESULT_LIMIT = 50;

export function LocationPicker({
  id,
  name,
  form,
  locations,
  value,
  defaultValue = "",
  onChange,
  onPlacePick,
  placesEnabled = false,
  emptyLabel = "One-off address",
  placeholder = "Type any name or address",
}: {
  id?: string;
  name?: string;
  form?: string;
  locations: LocationPickerRow[];
  value?: string;
  defaultValue?: string;
  onChange?: (locationId: string) => void;
  onPlacePick?: (place: PlaceDetails) => void;
  placesEnabled?: boolean;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const listId = useId().replace(/:/g, "") + "-location-list";
  const inputId = id ?? (name ? `${name}-search` : listId.replace(/-location-list$/, "-search"));
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const selectedId = value ?? uncontrolled;
  const selected = locations.find((location) => String(location.id) === selectedId) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => filterLocationsForPicker(locations, query, RESULT_LIMIT), [locations, query]);
  const [placeResults, setPlaceResults] = useState<PlaceSuggestion[]>([]);
  const [placePending, setPlacePending] = useState(false);
  const options = useMemo(() => [{ id: "", name: emptyLabel }, ...matches], [emptyLabel, matches]);

  useEffect(() => {
    if (!placesEnabled || !onPlacePick) {
      setPlaceResults([]);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setPlaceResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setPlacePending(true);
      void searchPlacesAction(trimmed)
        .then((next) => setPlaceResults(next))
        .catch(() => setPlaceResults([]))
        .finally(() => setPlacePending(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [onPlacePick, placesEnabled, query]);

  function setSelected(next: string) {
    if (value === undefined) setUncontrolled(next);
    onChange?.(next);
  }

  function close() {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }

  function pick(next: string) {
    const location = next ? locations.find((row) => String(row.id) === next) : null;
    if (next && !location) return;
    setSelected(next);
    close();
  }

  async function pickPlace(placeId: string) {
    try {
      const place = await placeDetailsAction(placeId);
      const matchedId = matchLocationForPlace(locations, place);
      if (matchedId != null) {
        pick(String(matchedId));
        return;
      }
      setSelected("");
      onPlacePick?.(place);
      close();
    } catch {
      close();
    }
  }

  function updateMenuRect() {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
    });
  }

  useEffect(() => {
    if (!open) return;
    updateMenuRect();
    function onDoc(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      if (target && (target as HTMLElement).closest?.("[data-location-picker-menu]")) return;
      close();
    }
    function onReposition() {
      updateMenuRect();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      setOpen(true);
      updateMenuRect();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = options[highlight];
      if (choice) pick(choice.id === "" ? "" : String(choice.id));
    }
  }

  const display = open ? query : selected ? selected.name : "";

  return (
    <div ref={rootRef} className="relative min-w-56" data-location-picker="" data-ignore-dirty="">
      {name ? <input type="hidden" name={name} form={form} value={selectedId} /> : null}
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        className="mt-1 w-full"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
          updateMenuRect();
        }}
        onChange={(event) => {
          event.stopPropagation();
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(0);
          updateMenuRect();
        }}
        onInput={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      />
      {selected && !open ? (
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{formatLocationAddress(selected) || "Saved location"}</p>
      ) : null}
      {open && menuRect && typeof document !== "undefined"
        ? createPortal(
            <div
              data-location-picker-menu=""
              className="fixed z-50 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
              style={{ top: menuRect.top, left: menuRect.left, width: Math.min(menuRect.width, 420) }}
            >
              <ul id={listId} role="listbox" className="max-h-64 overflow-auto text-sm">
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={highlight === 0}
                    className={`w-full px-3 py-2 text-left ${highlight === 0 ? "bg-slate-100" : ""}`}
                    onMouseEnter={() => setHighlight(0)}
                    onClick={() => pick("")}
                  >
                    {emptyLabel}
                  </button>
                </li>
                {query.trim() ? (
                  matches.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-slate-500">
                      {placesEnabled
                        ? "No saved location matches. Pick a Google result or keep a one-off address."
                        : "No saved location matches. Keep typing a one-off address — this does not create a location."}
                    </li>
                  ) : (
                    matches.map((location, index) => {
                      const optionIndex = index + 1;
                      const address = formatLocationAddress(location);
                      return (
                        <li key={location.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={highlight === optionIndex}
                            className={`w-full px-3 py-2 text-left ${highlight === optionIndex ? "bg-slate-100" : ""}`}
                            onMouseEnter={() => setHighlight(optionIndex)}
                            onClick={() => pick(String(location.id))}
                          >
                            <div className="font-semibold text-slate-900">{location.name}</div>
                            {address ? <div className="text-xs text-slate-500">{address}</div> : null}
                          </button>
                        </li>
                      );
                    })
                  )
                ) : (
                  <li className="px-3 py-2 text-xs text-slate-500">
                    Type any name or address to filter {locations.length.toLocaleString()} saved locations.
                  </li>
                )}
                {placesEnabled && query.trim().length >= 3 ? (
                  <li className="border-t border-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {placePending ? "Searching places…" : "Google places"}
                  </li>
                ) : null}
                {placeResults.map((item) => (
                  <li key={item.placeId}>
                    <button
                      type="button"
                      role="option"
                      className="w-full px-3 py-2 text-left hover:bg-slate-100"
                      onClick={() => void pickPlace(item.placeId)}
                    >
                      <div className="font-semibold text-slate-900">{item.label}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
