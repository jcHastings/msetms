"use client";

import { useMemo, useState } from "react";
import {
  defaultReportColumns,
  REPORT_CATEGORIES,
  REPORT_DATE_BASES,
  REPORT_EXPORT_COLUMNS,
  type ReportCategory,
  type ReportExportColumn,
} from "@/lib/reports-shared";

type Option = { id: number; label: string };

export function ManageReportForm({
  customers,
  drivers,
  trucks,
  dispatchers,
}: {
  customers: Option[];
  drivers: Option[];
  trucks: Option[];
  dispatchers: Option[];
}) {
  const [category, setCategory] = useState<ReportCategory>("customer");
  const [checked, setChecked] = useState<ReportExportColumn[]>(defaultReportColumns());
  const entities =
    category === "driver" ? drivers : category === "truck" ? trucks : category === "dispatcher" ? dispatchers : customers;
  const entityName =
    category === "driver" ? "driverId" : category === "truck" ? "truckId" : category === "dispatcher" ? "dispatcherId" : "customerId";
  const entityLabel = REPORT_CATEGORIES.find((item) => item.value === category)?.label ?? "Customer";
  const allOn = checked.length === REPORT_EXPORT_COLUMNS.length;
  const selected = useMemo(() => new Set(checked), [checked]);

  function toggle(column: ReportExportColumn, on: boolean): void {
    setChecked((current) => {
      if (on) return current.includes(column) ? current : [...current, column];
      return current.filter((item) => item !== column);
    });
  }

  return (
    <form className="card space-y-4 p-5" action="/api/reports/export" method="get">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="field">
          <label htmlFor="report-category">Category</label>
          <select
            id="report-category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ReportCategory)}
          >
            {REPORT_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-entity">{entityLabel}</label>
          <select id="report-entity" key={entityName} name={entityName} defaultValue="">
            <option value="">All {entityLabel.toLowerCase()}s</option>
            {entities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-basis">Filter by</label>
          <select id="report-basis" name="dateBasis" defaultValue="pickup">
            {REPORT_DATE_BASES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-format">Format</label>
          <select id="report-format" name="format" defaultValue="csv">
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-from">From</label>
          <input id="report-from" name="from" type="date" />
        </div>
        <div className="field">
          <label htmlFor="report-to">To</label>
          <input id="report-to" name="to" type="date" />
        </div>
      </div>
      <fieldset data-column-chooser="" className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Columns</legend>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setChecked(defaultReportColumns())}
          >
            {allOn ? "All selected" : "Select all"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setChecked([])}>
            Clear
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_EXPORT_COLUMNS.map((column) => (
            <label key={column.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="columns"
                value={column.key}
                checked={selected.has(column.key)}
                onChange={(event) => toggle(column.key, event.target.checked)}
              />
              {column.label}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn btn-primary" type="submit">
        Download
      </button>
    </form>
  );
}
