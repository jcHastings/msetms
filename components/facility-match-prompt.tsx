"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Asks before a rate-con stop or a new location reuses a saved facility.
 * Use and Create new are real buttons. Nothing is written until Use.
 */
export function FacilityMatchPrompt({
  facilityName,
  pending = false,
  autoFocus = false,
  existingId,
  useName,
  createName,
  onUse,
  onCreateNew,
  extraNote,
}: {
  facilityName: string;
  pending?: boolean;
  autoFocus?: boolean;
  existingId?: number | null;
  useName?: string;
  createName?: string;
  onUse?: () => void;
  onCreateNew?: () => void;
  extraNote?: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const useButtonRef = useRef<HTMLButtonElement | null>(null);

  function focusUse(node: HTMLButtonElement | null) {
    useButtonRef.current = node;
    if (!autoFocus || !node) return;
    node.focus();
  }

  useEffect(() => {
    if (!autoFocus) return;
    const node = useButtonRef.current;
    if (!node) return;
    node.focus();
    const frame = window.requestAnimationFrame(() => node.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, facilityName]);

  const useSubmits = Boolean(useName) && !onUse;
  const createSubmits = Boolean(createName) && !onCreateNew;

  return (
    <section
      data-facility-match=""
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={pending || undefined}
      className="rounded-lg border border-[#d3d9e0] bg-white px-3 py-3 text-[#252525] shadow-[0_8px_28px_rgba(7,50,90,0.08)]"
    >
      <h3 id={titleId} className="text-base font-semibold tracking-tight text-[#07325a]">
        Looks like {facilityName}. Use it?
      </h3>
      <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-[#5b6b7c]">
        This matches a location already on file. Use keeps that facility and remembers this name and address for next
        time. Create new adds a separate location. Nothing on the saved facility changes until you choose Use.
      </p>
      {extraNote}
      {existingId ? <input type="hidden" name="existing_id" value={existingId} /> : null}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Saved facility ${facilityName}`}>
        <button
          ref={focusUse}
          className="btn btn-primary min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#137cdd]"
          type={useSubmits ? "submit" : "button"}
          name={useSubmits ? useName : undefined}
          value={useSubmits ? "1" : undefined}
          disabled={pending}
          onClick={onUse}
        >
          {pending ? "Saving…" : "Use"}
        </button>
        <button
          className="btn btn-secondary min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#137cdd]"
          type={createSubmits ? "submit" : "button"}
          name={createSubmits ? createName : undefined}
          value={createSubmits ? "1" : undefined}
          disabled={pending}
          onClick={onCreateNew}
        >
          Create new
        </button>
      </div>
    </section>
  );
}
