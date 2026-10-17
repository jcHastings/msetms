"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { loadGoogleMaps, type GooglePlacePrediction, type GooglePlaceResult } from "@/lib/maps-js";
import { parseAddressComponents, type PlaceDetails } from "@/lib/places-shared";

type PreviewSuggestion = {
  placeId: string;
  label: string;
  place: PlaceDetails;
};

function latLngOf(geometry: GooglePlaceResult["geometry"]): { lat: number; lng: number } | null {
  const point = geometry?.location;
  if (!point) return null;
  const lat = typeof point.lat === "function" ? point.lat() : point.lat;
  const lng = typeof point.lng === "function" ? point.lng() : point.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function placeFromResult(result: GooglePlaceResult, fallbackId: string): PlaceDetails {
  const parsed = parseAddressComponents(result.address_components ?? []);
  const pin = latLngOf(result.geometry);
  return {
    placeId: String(result.place_id || fallbackId).trim(),
    name: String(result.name ?? "").trim(),
    street: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    country: parsed.country,
    formatted: String(result.formatted_address ?? "").trim(),
    latitude: pin?.lat ?? null,
    longitude: pin?.lng ?? null,
  };
}

export function PlacesAutocomplete({
  apiKey,
  id,
  name,
  value,
  onChange,
  onPlace,
  onAvailability,
  placeholder = "Search Google Maps",
  required = false,
  previewSuggestions,
}: {
  apiKey: string;
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onPlace: (place: PlaceDetails, query: string) => void;
  onAvailability?: (ready: boolean) => void;
  placeholder?: string;
  required?: boolean;
  /** Screenshot harness only. Production pages leave this unset. */
  previewSuggestions?: PreviewSuggestion[];
}) {
  const listId = useId().replace(/:/g, "") + "-places";
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [ready, setReady] = useState(() => Boolean(previewSuggestions?.length));
  const [predictions, setPredictions] = useState<GooglePlacePrediction[]>([]);
  const [pending, setPending] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attributionRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<{
    getPlacePredictions: (
      request: Record<string, unknown>,
      callback: (results: GooglePlacePrediction[] | null, status: string) => void,
    ) => void;
  } | null>(null);

  useEffect(() => {
    if (previewSuggestions || !apiKey.trim()) return;
    let cancelled = false;
    void loadGoogleMaps(apiKey.trim())
      .then((maps) => {
        if (cancelled) return;
        const Service = maps.places?.AutocompleteService;
        if (!Service) throw new Error("Places library did not load.");
        serviceRef.current = new Service();
        setReady(true);
        onAvailability?.(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(false);
        onAvailability?.(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, onAvailability, previewSuggestions]);

  useEffect(() => {
    if (!ready || previewSuggestions || !open || value.trim().length < 3) return;
    const service = serviceRef.current;
    if (!service) return;
    const handle = window.setTimeout(() => {
      const trimmed = value.trim();
      setPending(true);
      service.getPlacePredictions({ input: trimmed, componentRestrictions: { country: "us" } }, (results, status) => {
        setPending(false);
        if (status !== "OK" && status !== "ZERO_RESULTS") {
          setPredictions([]);
          return;
        }
        setPredictions((results ?? []).slice(0, 6));
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [open, previewSuggestions, ready, value]);

  const shown: Array<{ placeId: string; label: string; preview?: PlaceDetails }> = previewSuggestions
    ? open && value.trim().length > 0
      ? previewSuggestions
          .filter((item) => item.label.toLowerCase().includes(value.trim().toLowerCase()) || value.trim().length >= 2)
          .map((item) => ({ placeId: item.placeId, label: item.label, preview: item.place }))
      : []
    : ready && open && value.trim().length >= 3
      ? predictions.map((item) => ({ placeId: item.place_id, label: item.description }))
      : [];

  function updateMenuRect() {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
  }

  function close() {
    setOpen(false);
    setHighlight(0);
  }

  useEffect(() => {
    if (!open) return;
    updateMenuRect();
    function onDoc(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      if (target && (target as HTMLElement).closest?.("[data-places-autocomplete-menu]")) return;
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

  function choosePreview(place: PlaceDetails) {
    const query = value;
    onPlace(place, query);
    close();
  }

  function choosePrediction(placeId: string) {
    const query = value;
    const maps = window.google?.maps;
    const PlacesService = maps?.places?.PlacesService;
    const host = attributionRef.current ?? document.createElement("div");
    if (!PlacesService) {
      setReady(false);
      onAvailability?.(false);
      close();
      return;
    }
    const details = new PlacesService(host);
    setPending(true);
    details.getDetails(
      { placeId, fields: ["place_id", "name", "formatted_address", "address_components", "geometry"] },
      (result, status) => {
        setPending(false);
        if (status !== "OK" || !result) {
          close();
          return;
        }
        onPlace(placeFromResult(result, placeId), query);
        close();
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!ready) return;
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
      setHighlight((current) => Math.min(current + 1, Math.max(shown.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && shown.length > 0) {
      event.preventDefault();
      const choice = shown[highlight];
      if (!choice) return;
      if (choice.preview) choosePreview(choice.preview);
      else choosePrediction(choice.placeId);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-56" data-places-autocomplete="" data-places-ready={ready ? "1" : "0"}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        value={value}
        placeholder={placeholder}
        className="mt-1 w-full"
        onFocus={() => {
          if (!ready) return;
          setOpen(true);
          setHighlight(0);
          updateMenuRect();
        }}
        onChange={(event) => {
          onChange(event.target.value);
          if (ready) {
            setOpen(true);
            setHighlight(0);
            updateMenuRect();
          }
        }}
        onKeyDown={onKeyDown}
      />
      <div ref={attributionRef} className="sr-only" data-places-attribution="" />
      {open && ready && menuRect && shown.length > 0 && typeof document !== "undefined"
        ? createPortal(
            <div
              data-places-autocomplete-menu=""
              className="fixed z-50 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
              style={{ top: menuRect.top, left: menuRect.left, width: Math.min(menuRect.width, 420) }}
            >
              <ul id={listId} role="listbox" className="max-h-64 overflow-auto text-sm">
                {shown.map((item, index) => (
                  <li key={item.placeId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={highlight === index}
                      className={`w-full px-3 py-2 text-left ${highlight === index ? "bg-slate-100" : ""}`}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => {
                        if (item.preview) choosePreview(item.preview);
                        else choosePrediction(item.placeId);
                      }}
                    >
                      <div className="font-semibold text-slate-900">{item.label}</div>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="border-t border-slate-100 px-3 py-1 text-[11px] text-slate-400">
                {previewSuggestions ? "Mocked Google suggestions" : pending ? "Searching Google…" : "Google Maps"}
              </p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
