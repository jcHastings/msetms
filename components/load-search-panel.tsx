"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadStatusBadge } from "@/components/status-badge";
import { deleteSearchReportAction, saveSearchReportAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import {
  US_STATES,
  datePresetRange,
  defaultLoadSearchCriteria,
  loadSearchHref,
} from "@/lib/load-search";
import {
  LOAD_STATUSES,
  SEARCH_COLUMNS,
  labelForLoadStatus,
  type Customer,
  type Driver,
  type LoadSearchCriteria,
  type LoadView,
  type SavedSearchReport,
  type SearchColumnId,
  type Trailer,
  type Truck,
} from "@/lib/types";

type Props = {
  initial: LoadSearchCriteria;
  results: LoadView[];
  reports: SavedSearchReport[];
  customers: Customer[];
  drivers: Driver[];
  trucks: Truck[];
  trailers: Trailer[];
};

export function LoadSearchPanel({
  initial,
  results,
  reports,
  customers,
  drivers,
  trucks,
  trailers,
}: Props) {
  const router = useRouter();
  const [criteria, setCriteria] = useState(initial);
  const [saveState, saveAction, saving] = useActionState(saveSearchReportAction, null);
  const dates = useMemo(
    () => datePresetRange(criteria.datePreset) ?? { from: criteria.dateFrom, to: criteria.dateTo },
    [criteria.datePreset, criteria.dateFrom, criteria.dateTo],
  );

  function patch(next: Partial<LoadSearchCriteria>) {
    setCriteria((current) => {
      const merged = { ...current, ...next, reportId: next.reportId ?? current.reportId };
      if (next.datePreset) {
        const range = datePresetRange(next.datePreset);
        if (range) {
          merged.dateFrom = range.from;
          merged.dateTo = range.to;
        }
      }
      if (next.datePreset === "") {
        merged.datePreset = "";
      }
      return merged;
    });
  }

  function toggleColumn(id: SearchColumnId, checked: boolean) {
    setCriteria((current) => {
      const next = checked
        ? [...new Set([...current.columns, id])]
        : current.columns.filter((column) => column !== id);
      return { ...current, columns: next.length ? next : current.columns };
    });
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    router.push(loadSearchHref({ ...criteria, reportId: criteria.reportId }));
  }

  return (
    <div className="space-y-4">
      <form className="card p-4" onSubmit={search}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Search criteria</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Saved report
              <select
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                value={criteria.reportId ?? ""}
                onChange={(event) => {
                  const id = Number.parseInt(event.target.value, 10);
                  const report = reports.find((item) => item.id === id);
                  if (!report) {
                    setCriteria(defaultLoadSearchCriteria());
                    router.push("/loads/search");
                    return;
                  }
                  router.push(loadSearchHref(report.filters));
                }}
              >
                <option value="">— None —</option>
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="field md:col-span-2">
            <label htmlFor="q">Search terms</label>
            <input
              id="q"
              value={criteria.q}
              onChange={(event) => patch({ q: event.target.value })}
              placeholder="Load #, customer, city, ref, notes"
            />
          </div>
          <div className="field">
            <label htmlFor="origin_state">Origin state</label>
            <select
              id="origin_state"
              value={criteria.originState}
              onChange={(event) => patch({ originState: event.target.value })}
            >
              <option value="">Any</option>
              {US_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dest_state">Destination state</label>
            <select
              id="dest_state"
              value={criteria.destState}
              onChange={(event) => patch({ destState: event.target.value })}
            >
              <option value="">Any</option>
              {US_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date_preset">Date preset</label>
            <select
              id="date_preset"
              value={criteria.datePreset}
              onChange={(event) =>
                patch({ datePreset: event.target.value as LoadSearchCriteria["datePreset"] })
              }
            >
              <option value="">Custom range</option>
              <option value="this_week">This week</option>
              <option value="this_month">This month</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="search_by">Search by</label>
            <select id="search_by" value="pickup" disabled>
              <option value="pickup">First pickup date</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="date_from">From</label>
            <input
              id="date_from"
              type="date"
              value={dates.from}
              onChange={(event) => patch({ datePreset: "", dateFrom: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="date_to">To</label>
            <input
              id="date_to"
              type="date"
              value={dates.to}
              onChange={(event) => patch({ datePreset: "", dateTo: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="customer_id">Customer</label>
            <select
              id="customer_id"
              value={criteria.customerId ?? ""}
              onChange={(event) =>
                patch({ customerId: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Any</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="driver_id">Driver</label>
            <select
              id="driver_id"
              value={criteria.driverId ?? ""}
              onChange={(event) =>
                patch({ driverId: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Any</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="truck_id">Truck</label>
            <select
              id="truck_id"
              value={criteria.truckId ?? ""}
              onChange={(event) =>
                patch({ truckId: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Any</option>
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.unit_number}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="trailer_id">Trailer</label>
            <select
              id="trailer_id"
              value={criteria.trailerId ?? ""}
              onChange={(event) =>
                patch({ trailerId: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Any</option>
              {trailers.map((trailer) => (
                <option key={trailer.id} value={trailer.id}>
                  {trailer.unit_number}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Load status</label>
            <select
              id="status"
              value={criteria.status}
              onChange={(event) =>
                patch({ status: event.target.value as LoadSearchCriteria["status"] })
              }
            >
              <option value="">All (from include)</option>
              {LOAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelForLoadStatus(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="font-semibold text-slate-600">Include</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={criteria.includeLive}
              onChange={(event) => patch({ includeLive: event.target.checked })}
            />
            Live
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={criteria.includeArchived}
              onChange={(event) => patch({ includeArchived: event.target.checked })}
            />
            Archived
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={criteria.includeCancelled}
              onChange={(event) => patch({ includeCancelled: event.target.checked })}
            />
            Cancelled
          </label>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Customize columns</summary>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {SEARCH_COLUMNS.map((column) => (
              <label key={column.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={criteria.columns.includes(column.id)}
                  onChange={(event) => toggleColumn(column.id, event.target.checked)}
                />
                {column.label}
              </label>
            ))}
          </div>
        </details>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit">
            Search
          </button>
          <Link href="/loads/search" className="btn btn-secondary">
            Clear
          </Link>
        </div>
      </form>

      <form action={saveAction} className="card flex flex-wrap items-end gap-3 p-4">
        <FormBanner result={saveState} />
        <input type="hidden" name="searched" value="1" />
        <input type="hidden" name="q" value={criteria.q} />
        <input type="hidden" name="origin_state" value={criteria.originState} />
        <input type="hidden" name="dest_state" value={criteria.destState} />
        <input type="hidden" name="date_preset" value={criteria.datePreset} />
        <input type="hidden" name="date_from" value={criteria.dateFrom} />
        <input type="hidden" name="date_to" value={criteria.dateTo} />
        <input type="hidden" name="customer_id" value={criteria.customerId ?? ""} />
        <input type="hidden" name="driver_id" value={criteria.driverId ?? ""} />
        <input type="hidden" name="truck_id" value={criteria.truckId ?? ""} />
        <input type="hidden" name="trailer_id" value={criteria.trailerId ?? ""} />
        <input type="hidden" name="status" value={criteria.status} />
        {criteria.includeLive ? <input type="hidden" name="include_live" value="1" /> : null}
        {criteria.includeArchived ? <input type="hidden" name="include_archived" value="1" /> : null}
        {criteria.includeCancelled ? <input type="hidden" name="include_cancelled" value="1" /> : null}
        <input type="hidden" name="cols" value={criteria.columns.join(",")} />
        <div className="field min-w-56 flex-1">
          <label htmlFor="report_name">Save report</label>
          <input id="report_name" name="report_name" placeholder="Name these filters" />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save report"}
        </button>
        {criteria.reportId ? (
          <button
            className="btn btn-ghost"
            formAction={deleteSearchReportAction}
            name="report_id"
            value={String(criteria.reportId)}
            type="submit"
          >
            Delete report
          </button>
        ) : null}
      </form>

      <section className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-2 text-sm text-slate-600">
          {results.length} load{results.length === 1 ? "" : "s"}
        </div>
        <table className="table-grid">
          <thead>
            <tr>
              {SEARCH_COLUMNS.filter((column) => criteria.columns.includes(column.id)).map((column) => (
                <th key={column.id}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={criteria.columns.length} className="text-slate-500">
                  No loads match these criteria.
                </td>
              </tr>
            ) : (
              results.map((load) => (
                <tr
                  key={load.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/loads/${load.id}`)}
                >
                  {criteria.columns.includes("load_id") ? (
                    <td className="font-mono font-semibold">
                      <Link href={`/loads/${load.id}`} className="underline">
                        {load.load_number}
                      </Link>
                    </td>
                  ) : null}
                  {criteria.columns.includes("pickups") ? (
                    <td>
                      <div>{load.origin}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(load.pickup_start)}</div>
                    </td>
                  ) : null}
                  {criteria.columns.includes("deliveries") ? (
                    <td>
                      <div>{load.destination}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(load.delivery_start)}</div>
                    </td>
                  ) : null}
                  {criteria.columns.includes("customer") ? <td>{load.customer_name}</td> : null}
                  {criteria.columns.includes("driver") ? <td>{load.driver_name || "—"}</td> : null}
                  {criteria.columns.includes("truck") ? <td>{load.truck_unit || "—"}</td> : null}
                  {criteria.columns.includes("trailer") ? (
                    <td>{load.trailer_unit || load.trailer_number || "—"}</td>
                  ) : null}
                  {criteria.columns.includes("refs") ? (
                    <td className="text-slate-600">
                      {[load.reference_number, load.po_number].filter(Boolean).join(" · ") || "—"}
                    </td>
                  ) : null}
                  {criteria.columns.includes("notes") ? (
                    <td className="max-w-xs text-slate-600">
                      {load.notes || load.special_instructions || "—"}
                    </td>
                  ) : null}
                  {criteria.columns.includes("status") ? (
                    <td>
                      <LoadStatusBadge status={load.status} />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
