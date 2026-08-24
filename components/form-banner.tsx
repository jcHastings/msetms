"use client";

import type { ActionResult } from "@/lib/types";

export function FormBanner({
  result,
  hideOk = false,
}: {
  result: ActionResult | null;
  hideOk?: boolean;
}) {
  if (!result) return null;
  if (result.ok) {
    if (hideOk) return null;
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {result.message || "Saved."}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {result.error}
    </div>
  );
}
