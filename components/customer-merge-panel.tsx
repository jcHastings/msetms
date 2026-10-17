"use client";

import { useMemo, useState } from "react";
import {
  confirmCustomerMergeAction,
  previewCustomerMergeAction,
  undoCustomerMergeAction,
} from "@/lib/customer-merge-actions";

const COUNT_LABELS = [
  ["loads", "Loads"],
  ["contacts", "Contacts"],
  ["documents", "Documents"],
  ["load_templates", "Load templates"],
  ["contracts", "Contracts"],
  ["detention_terms", "Detention terms"],
  ["requirements", "Requirements"],
  ["reminders", "Reminders"],
  ["detention_requests", "Detention requests"],
  ["invoices", "Invoices"],
] as const;

type MergePlan = {
  keeperName: string;
  losers: Array<{ name: string }>;
  counts: Record<(typeof COUNT_LABELS)[number][0], number>;
  creditHoldAfter: number;
  fills: Array<{ field: string; fromId: number; value: string }>;
  aliases: string[];
};

type OpenMerge = {
  id: number;
  keeperId: number;
  loserIds: number[];
  createdAt: string;
};

type Candidate = { id: number; name: string; mc_number: string };

/**
 * Reading this as: redesign-preserve of an internal freight desk customer record,
 * for administrators, with the existing desk language.
 * Dials: DESIGN_VARIANCE 3, MOTION_INTENSITY 2, VISUAL_DENSITY 6.
 */
export function CustomerMergePanel({
  keeper,
  candidates,
  merges,
  canPick,
}: {
  keeper: { id: number; name: string };
  candidates: Candidate[];
  merges: OpenMerge[];
  canPick: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (selected.includes(candidate.id)) return true;
      if (!needle) return true;
      return (
        candidate.name.toLowerCase().includes(needle) ||
        candidate.mc_number.toLowerCase().includes(needle) ||
        String(candidate.id) === needle
      );
    });
  }, [candidates, query, selected]);

  function toggle(id: number) {
    setPlan(null);
    setMessage("");
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function preview() {
    setPending(true);
    setError("");
    setMessage("");
    const result = await previewCustomerMergeAction(keeper.id, selected);
    setPending(false);
    if (!result.ok) {
      setPlan(null);
      setError(result.error);
      return;
    }
    setPlan(result.plan);
  }

  async function confirm() {
    setPending(true);
    setError("");
    const result = await confirmCustomerMergeAction(keeper.id, selected);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlan(null);
    setSelected([]);
    setMessage(result.message || "Customers merged.");
  }

  async function undo(mergeId: number) {
    setPending(true);
    setError("");
    const result = await undoCustomerMergeAction(mergeId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message || "Merge undone.");
  }

  return (
    <section className="card mt-4 p-6" data-customer-merge="">
      <h2 className="text-sm font-semibold text-slate-900">Merge customers</h2>
      <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-slate-600">
        Fold other customers into {keeper.name}. Loads, contacts, and files move here. The other records stay
        archived. QuickBooks is not contacted.
      </p>
      {message ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {canPick ? (
        <div className="mt-4 grid gap-4">
          <div className="field">
            <label htmlFor="merge-customer-q">Customers to merge</label>
            <input
              id="merge-customer-q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-slate-600">Search by name or MC, then choose one or more.</p>
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-600">No other active customers to merge.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
              {visible.map((candidate) => {
                const checked = selected.includes(candidate.id);
                return (
                  <li key={candidate.id}>
                    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggle(candidate.id)}
                      />
                      <span>
                        {candidate.name}
                        {candidate.mc_number ? (
                          <span className="mt-0.5 block text-xs text-slate-600">MC {candidate.mc_number}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" type="button" disabled={pending || selected.length === 0} onClick={preview}>
              {pending && !plan ? "Working…" : "Preview merge"}
            </button>
          </div>
          {plan ? (
            <div data-merge-preview="">
              <p className="text-sm text-slate-700">
                {plan.losers.map((row) => row.name).join(", ")} move onto {plan.keeperName}.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
                {COUNT_LABELS.map(([key, label]) => (
                  <div key={key}>
                    <dt className="text-xs text-slate-600">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums text-slate-900">{plan.counts[key]}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                <li>Credit hold {plan.creditHoldAfter ? "will be on" : "stays off"}.</li>
                {plan.fills.map((fill) => (
                  <li key={`${fill.field}-${fill.fromId}`}>
                    {fill.field.replace(/_/g, " ")} comes from customer {fill.fromId}: {fill.value}
                  </li>
                ))}
                {plan.aliases.length ? <li>Names kept as aliases: {plan.aliases.join(", ")}.</li> : null}
              </ul>
              <button className="btn btn-primary mt-4" type="button" disabled={pending} onClick={confirm} data-merge-confirm="">
                {pending ? "Working…" : "Merge customers"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">This customer is archived, so it cannot be the keeper.</p>
      )}
      {merges.length ? (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Open merges</h3>
          <ul className="mt-2 space-y-3">
            {merges.map((merge) => (
              <li key={merge.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-700">
                  Merge {merge.id} on {merge.createdAt.slice(0, 10)}. Customers {merge.loserIds.join(", ")} into{" "}
                  {merge.keeperId}.
                </p>
                <button className="btn btn-secondary" type="button" disabled={pending} onClick={() => undo(merge.id)}>
                  Undo merge
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
