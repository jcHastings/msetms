"use client";

import { rateConNeedsReview, type ParsedRateCon, type RateConFieldFlag } from "@/lib/rate-con-shared";

export function RateConFieldFlags({ parsed }: { parsed: ParsedRateCon }) {
  const flags = parsed.field_flags.filter((flag) => flag.status === "missing" || flag.status === "low");
  if (!flags.length && parsed.reader === "ai") return null;
  return (
    <div
      role="status"
      className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
      data-rate-con-flags=""
    >
      {parsed.reader === "ai" ? (
        <p className="font-medium">AI draft — confirm before save. Nothing is booked until you confirm.</p>
      ) : parsed.reader === "hint" ? (
        <p className="font-medium">Guessed from the document text. Confirm every money and customer field.</p>
      ) : (
        <p className="font-medium">No load fields were read. Fill the form by hand. Nothing was saved.</p>
      )}
      {flags.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {flags.map((flag) => (
            <li key={flag.key} data-flag={flag.key} data-flag-status={flag.status}>
              <span className="font-medium">{flag.label}:</span> {flag.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs">Missing or low-confidence fields will show here.</p>
      )}
    </div>
  );
}

export function RateConNeedsReviewNote({ parsed }: { parsed: ParsedRateCon }) {
  if (!rateConNeedsReview(parsed)) return null;
  return (
    <p className="mb-3 text-sm text-amber-800" data-rate-con-needs-review="">
      Fill the highlighted fields, then confirm. Customer and rate stay empty when the reader is not sure.
    </p>
  );
}

export function flagForField(flags: RateConFieldFlag[], key: string): RateConFieldFlag | undefined {
  return flags.find((flag) => flag.key === key);
}
