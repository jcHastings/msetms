"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { driverChangeTrailerAction } from "@/lib/driver-actions";
import {
  driverTrailerWarnings,
  initialTrailerSelection,
  trailerUnitsEqual,
  type DriverTrailerChangeFacts,
  type DriverTrailerOption,
} from "@/lib/driver-trailer-change";

const fieldStyle = {
  color: "#122033",
  background: "#fff",
  minHeight: "3.5rem",
  fontSize: "1.125rem",
} as const;

export function DriverTrailerChangeForm({
  loadId,
  facts,
}: {
  loadId: number;
  facts: DriverTrailerChangeFacts;
}) {
  const initial = initialTrailerSelection(facts);
  const [selectedId, setSelectedId] = useState<number | null>(initial.trailerId);
  const [custom, setCustom] = useState(initial.customNumber);
  const [query, setQuery] = useState("");
  const [state, action, pending] = useActionState(driverChangeTrailerAction, null);
  const warnings = useMemo(
    () => driverTrailerWarnings({ facts, trailerId: selectedId, customNumber: custom }),
    [facts, selectedId, custom],
  );
  const needle = query.trim().toLowerCase();
  const visible = facts.trailers.filter((trailer) =>
    needle ? trailer.unitNumber.toLowerCase().includes(needle) : true,
  );
  const ordered = [...visible].sort((left, right) => {
    const leftRank = rankTrailer(left, facts);
    const rightRank = rankTrailer(right, facts);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true, sensitivity: "base" });
  });

  return (
    <form action={action} className="driver-sheet mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <input type="hidden" name="load_id" value={String(loadId)} />
      <input type="hidden" name="trailer_id" value={custom.trim() ? "" : selectedId ?? ""} />

      <p className="text-base" data-trailer-current="">
        On this load: {facts.assignedUnit || "None yet"}
      </p>
      {facts.suggestionSource === "latest" && facts.suggestedUnit ? (
        <p className="mt-2 text-base font-medium" data-trailer-suggestion="">
          Suggested from your latest load.
        </p>
      ) : null}

      <div className="mt-4">
        <label htmlFor="trailer-search" className="text-base font-semibold">
          Search by trailer number
        </label>
        <input
          id="trailer-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-trailer-search=""
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4"
          style={fieldStyle}
        />
      </div>

      <div
        role="radiogroup"
        aria-label="Active trailers"
        className="mt-3 max-h-64 space-y-2 overflow-y-auto"
        data-trailer-list=""
      >
        {ordered.length === 0 ? (
          <p className="text-base text-slate-600">Type the trailer number below.</p>
        ) : (
          ordered.map((trailer) => {
            const badge = trailerBadge(trailer, facts);
            const checked = !custom.trim() && selectedId === trailer.id;
            return (
              <label
                key={trailer.id}
                className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-3"
                data-trailer-option={trailer.unitNumber}
              >
                <input
                  type="radio"
                  name="trailer_choice"
                  checked={checked}
                  onChange={() => {
                    setSelectedId(trailer.id);
                    setCustom("");
                  }}
                  className="size-6 shrink-0"
                  style={{ accentColor: "#137cdd" }}
                />
                <span className="text-lg font-semibold">{trailer.unitNumber}</span>
                {badge ? (
                  <span
                    className="ml-auto rounded-full bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-950"
                    data-trailer-badge={badge}
                  >
                    {badge}
                  </span>
                ) : null}
              </label>
            );
          })
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="custom-trailer" className="text-base font-semibold">
          Other trailer number
        </label>
        <input
          id="custom-trailer"
          name="custom_number"
          value={custom}
          onChange={(event) => {
            setCustom(event.target.value);
            if (event.target.value.trim()) setSelectedId(null);
          }}
          data-trailer-custom=""
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4"
          style={fieldStyle}
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        data-trailer-warnings=""
        className={
          warnings.length
            ? "mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-950"
            : "mt-4"
        }
      >
        {warnings.map((text) => (
          <p key={text} data-trailer-warning="">
            {text}
          </p>
        ))}
      </div>

      {state && !state.ok ? (
        <p className="mt-3 text-base font-medium text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary mt-4 w-full"
        style={{ minHeight: "3.5rem", fontSize: "1.0625rem" }}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Saving…" : "Save trailer"}
      </button>
    </form>
  );
}

function rankTrailer(trailer: DriverTrailerOption, facts: DriverTrailerChangeFacts): number {
  if (facts.suggestionSource === "latest" && trailerUnitsEqual(trailer.unitNumber, facts.suggestedUnit)) return 0;
  if (facts.suggestionSource === "current" && trailerUnitsEqual(trailer.unitNumber, facts.assignedUnit)) return 0;
  if (trailerUnitsEqual(trailer.unitNumber, facts.latestUnit)) return 1;
  return 2;
}

function trailerBadge(trailer: DriverTrailerOption, facts: DriverTrailerChangeFacts): string {
  if (facts.suggestionSource === "latest" && trailerUnitsEqual(trailer.unitNumber, facts.suggestedUnit)) {
    return "Suggested";
  }
  if (facts.suggestionSource === "current" && trailerUnitsEqual(trailer.unitNumber, facts.assignedUnit)) {
    return "On this load";
  }
  if (
    facts.latestUnit &&
    !trailerUnitsEqual(facts.latestUnit, facts.assignedUnit) &&
    trailerUnitsEqual(trailer.unitNumber, facts.latestUnit)
  ) {
    return "Latest load";
  }
  return "";
}
