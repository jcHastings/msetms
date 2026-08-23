"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadStatusBadge } from "@/components/status-badge";
import { deleteSearchReportFormAction, saveSearchReportAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { US_STATES } from "@/lib/locations";
import { searchLoadsAction } from "@/lib/search-actions";
import {
  SEARCH_COLUMNS,
  defaultSearchColumns,
  defaultSearchCriteria,
  monthDateRange,
  parseSavedColumns,
  parseSavedFilters,
  weekDateRange,
  type LoadSearchCriteria,
  type SavedReport,
  type SearchColumnKey,
} from "@/lib/search";
import { LOAD_STATUSES, labelForLoadStatus, type ActionResult, type Customer, type DriverWithTruck, type LoadView, type Trailer, type Truck } from "@/lib/types";

type Props = {
  customers: Customer[];
  drivers: DriverWithTruck[];
  trucks: Truck[];
  trailers: Trailer[];
  reports: SavedReport[];
  initialResults: LoadView[];
};

export function LoadSearch({ customers, drivers, trucks, trailers, reports, initialResults }: Props) {
  const [criteria, setCriteria] = useState<LoadSearchCriteria>(defaultSearchCriteria());
  const [columns, setColumns] = useState<SearchColumnKey[]>(defaultSearchColumns());
  const [results, setResults] = useState<LoadView[]>(initialResults);
  const [searched, setSearched] = useState(false);
  const [reportName, setReportName] = useState("");
  const [selectedReport, setSelectedReport] = useState("");
  const [saveState, saveAction, savePending] = useActionState(saveSearchReportAction, null);
  const router = useRouter();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (saveState?.ok) {
      setReportName("");
      router.refresh();
    }
  }, [saveState, router]);

  const visible = useMemo(() => new Set(columns), [columns]);

  function patch(next: Partial<LoadSearchCriteria>) {
    setCriteria((current) => ({ ...current, ...next }));
  }

  function applyReport(id: string) {
    setSelectedReport(id);
    const report = reports.find((item) => String(item.id) === id);
    if (!report) return;
    setCriteria(parseSavedFilters(report.filters_json));
    setColumns(parseSavedColumns(report.columns_json));
  }

  function toggleColumn(key: SearchColumnKey) {
    setColumns((current) => {
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((item) => item !== key);
      }
      return SEARCH_COLUMNS.map((column) => column.key).filter((item) => item === key || current.includes(item));
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="card space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setSearched(true);
          setSearching(true);
          void runSearch(criteria)
            .then(setResults)
            .finally(() => setSearching(false));
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Search criteria</h2>
            <p className="mt-1 text-xs text-slate-500">
              Filter live loads by first pickup date. Open a saved report or save the current view.
            </p>
          </div>
          <div className="field min-w-56">
            <label htmlFor="saved_report">Saved reports</label>
            <select
              id="saved_report"
              value={selectedReport}
              onChange={(event) => applyReport(event.target.value)}
            >
              <option value="">Open a report…</option>
              {reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="field md:col-span-2">
            <label htmlFor="q">Search terms</label>
            <input
              id="q"
              name="q"
              value={criteria.q}
              onChange={(event) => patch({ q: event.target.value })}
              placeholder="Load #, customer, city, commodity, refs, notes"
            />
          </div>
          <div className="field">
            <label htmlFor="originState">Origin state</label>
            <select
              id="originState"
              name="originState"
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
            <label htmlFor="destState">Dest state</label>
            <select
              id="destState"
              name="destState"
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
            <label htmlFor="dateFrom">Date from</label>
            <input
              id="dateFrom"
              name="dateFrom"
              type="date"
              value={criteria.dateFrom}
              onChange={(event) => patch({ dateFrom: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="dateTo">Date to</label>
            <input
              id="dateTo"
              name="dateTo"
              type="date"
              value={criteria.dateTo}
              onChange={(event) => patch({ dateTo: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="searchBy">Search by</label>
            <input type="hidden" name="searchBy" value="pickup" />
            <select id="searchBy" value="pickup" disabled>
              <option value="pickup">First pickup date</option>
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2 pb-0.5">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => patch(weekDateRange())}
            >
              This week
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => patch(monthDateRange())}
            >
              This month
            </button>
          </div>
          <div className="field">
            <label htmlFor="customerId">Customer</label>
            <select
              id="customerId"
              name="customerId"
              value={criteria.customerId ?? ""}
              onChange={(event) => patch({ customerId: event.target.value ? Number(event.target.value) : null })}
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
            <label htmlFor="driverId">Driver</label>
            <select
              id="driverId"
              name="driverId"
              value={criteria.driverId ?? ""}
              onChange={(event) => patch({ driverId: event.target.value ? Number(event.target.value) : null })}
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
            <label htmlFor="truckId">Truck</label>
            <select
              id="truckId"
              name="truckId"
              value={criteria.truckId ?? ""}
              onChange={(event) => patch({ truckId: event.target.value ? Number(event.target.value) : null })}
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
            <label htmlFor="trailerId">Trailer</label>
            <select
              id="trailerId"
              name="trailerId"
              value={criteria.trailerId ?? ""}
              onChange={(event) => patch({ trailerId: event.target.value ? Number(event.target.value) : null })}
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
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={criteria.status}
              onChange={(event) => patch({ status: event.target.value })}
            >
              <option value="">Any (use include)</option>
              {LOAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelForLoadStatus(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-semibold text-slate-600">Include</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeLive"
              checked={criteria.includeLive}
              onChange={(event) => patch({ includeLive: event.target.checked })}
            />
            Live
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeArchived"
              checked={criteria.includeArchived}
              onChange={(event) => patch({ includeArchived: event.target.checked })}
            />
            Archived
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeCancelled"
              checked={criteria.includeCancelled}
              onChange={(event) => patch({ includeCancelled: event.target.checked })}
            />
            Cancelled
          </label>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Visible columns</div>
          <div className="flex flex-wrap gap-3 text-sm">
            {SEARCH_COLUMNS.map((column) => (
              <label key={column.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visible.has(column.key)}
                  onChange={() => toggleColumn(column.key)}
                />
                {column.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button className="btn btn-primary" type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              const next = defaultSearchCriteria();
              setCriteria(next);
              setColumns(defaultSearchColumns());
              setSelectedReport("");
              setSearched(false);
              void runSearch(next).then(setResults);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      <form action={saveAction} className="card flex flex-wrap items-end gap-3 px-5 py-4">
        <FormBanner result={saveState} />
        <input type="hidden" name="filters_json" value={JSON.stringify(criteria)} />
        <input type="hidden" name="columns_json" value={JSON.stringify(columns)} />
        <div className="field min-w-64 flex-1">
          <label htmlFor="report_name">Save named report</label>
          <input
            id="report_name"
            name="name"
            value={reportName}
            onChange={(event) => setReportName(event.target.value)}
            placeholder="This week live reefers"
          />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={savePending || !reportName.trim()}>
          {savePending ? "Saving…" : "Save report"}
        </button>
        {selectedReport ? (
          <button
            className="btn btn-ghost text-rose-700"
            type="submit"
            formAction={deleteSearchReportFormAction}
            name="report_id"
            value={selectedReport}
          >
            Delete report
          </button>
        ) : null}
      </form>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">
          {results.length} load{results.length === 1 ? "" : "s"}
          {searched ? "" : " (live, default)"}
        </div>
        {results.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No loads match these criteria.</p>
        ) : (
          <table className="table-grid">
            <thead>
              <tr>
                {SEARCH_COLUMNS.filter((column) => visible.has(column.key)).map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((load) => (
                <tr key={load.id}>
                  {visible.has("load_id") ? (
                    <td>
                      <Link href={`/loads/${load.id}`} className="font-mono font-semibold underline">
                        {load.load_number}
                      </Link>
                    </td>
                  ) : null}
                  {visible.has("pickups") ? (
                    <td>
                      <div>{load.origin}</div>
                      <div className="text-xs text-slate-500">
                        {formatDateTime(load.pickup_start)} – {formatDateTime(load.pickup_end)}
                      </div>
                    </td>
                  ) : null}
                  {visible.has("deliveries") ? (
                    <td>
                      <div>{load.destination}</div>
                      <div className="text-xs text-slate-500">
                        {formatDateTime(load.delivery_start)} – {formatDateTime(load.delivery_end)}
                      </div>
                    </td>
                  ) : null}
                  {visible.has("customer") ? <td>{load.customer_name}</td> : null}
                  {visible.has("driver") ? <td>{load.driver_name || "—"}</td> : null}
                  {visible.has("truck") ? <td>{load.truck_unit || "—"}</td> : null}
                  {visible.has("trailer") ? <td>{load.trailer_unit || load.trailer_number || "—"}</td> : null}
                  {visible.has("refs") ? (
                    <td className="text-slate-600">
                      {[load.reference_number, load.po_number].filter(Boolean).join(" · ") || "—"}
                    </td>
                  ) : null}
                  {visible.has("notes") ? (
                    <td className="max-w-xs text-slate-600">
                      {load.notes || load.special_instructions || load.appointment_notes || "—"}
                    </td>
                  ) : null}
                  {visible.has("status") ? (
                    <td>
                      <LoadStatusBadge status={load.status} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

async function runSearch(criteria: LoadSearchCriteria): Promise<LoadView[]> {
  return searchLoadsAction(criteria);
}
