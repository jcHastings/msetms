"use client";

import { useState } from "react";
import { updateLoadStatusAction } from "@/lib/actions";
import { loadStatusBadgeClass } from "@/lib/load-status-style";
import { LOAD_STATUSES, labelForLoadStatus, type LoadStatus } from "@/lib/types";

export function LoadStatusSelect({
  loadId,
  status,
  extraStatuses = [],
}: {
  loadId: number;
  status: LoadStatus | string;
  extraStatuses?: Array<{ value: string; label: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onChange(next: string) {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("status", next);
    const result = await updateLoadStatusAction(formData);
    setPending(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="min-w-36">
      <select
        className={`w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-medium ${loadStatusBadgeClass(status)}`}
        defaultValue={status}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Load status"
      >
        {LOAD_STATUSES.map((value) => (
          <option key={value} value={value}>
            {labelForLoadStatus(value)}
          </option>
        ))}
        {extraStatuses.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-[11px] text-rose-700">{error}</p> : null}
    </div>
  );
}
