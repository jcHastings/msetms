"use client";

import { REPORT_CATEGORIES, REPORT_DATE_BASES, type ReportCategory, type ReportDateBasis } from "@/lib/reports-shared";

type Option = { id: number; label: string };

export function StatsFilters({
  category,
  entityId,
  dateBasis,
  shift,
  customers,
  drivers,
  trucks,
  dispatchers,
}: {
  category: ReportCategory;
  entityId: number | null;
  dateBasis: ReportDateBasis;
  shift: number;
  customers: Option[];
  drivers: Option[];
  trucks: Option[];
  dispatchers: Option[];
}) {
  const entities =
    category === "driver" ? drivers : category === "truck" ? trucks : category === "dispatcher" ? dispatchers : customers;
  const showLabel = category === "driver" ? "Drivers" : category === "truck" ? "Trucks" : category === "dispatcher" ? "Dispatchers" : "Customers";

  return (
    <form className="stats-toolbar" method="get">
      {shift ? <input type="hidden" name="shift" value={shift} /> : null}
      <div className="field">
        <label htmlFor="stats-category">Report</label>
        <select
          id="stats-category"
          name="category"
          defaultValue={category}
          onChange={(event) => {
            const form = event.currentTarget.form;
            const entity = form?.elements.namedItem("entityId");
            if (entity instanceof HTMLSelectElement) entity.value = "";
            form?.requestSubmit();
          }}
        >
          {REPORT_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label === "Driver" ? "Drivers" : `${item.label}s`}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="stats-entity">Show</label>
        <select
          id="stats-entity"
          name="entityId"
          defaultValue={entityId ?? ""}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="">All {showLabel}</option>
          {entities.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="stats-basis">Filter By</label>
        <select
          id="stats-basis"
          name="dateBasis"
          defaultValue={dateBasis}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {REPORT_DATE_BASES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.shortLabel}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
