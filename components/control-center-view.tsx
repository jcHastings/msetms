"use client";

import { useMemo, useState } from "react";
import { FilterPills } from "@/components/filter-pills";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { LoadStatusBadge } from "@/components/status-badge";
import {
  EMPTY_CONTROL_FILTERS,
  controlCenterFilterOptions,
  controlCenterPoints,
  filterControlCenterItems,
  type ControlCenterFilters,
  type ControlCenterItem,
} from "@/lib/control-center-shared";
import type { LoadMapPoint } from "@/lib/load-map-shared";

export function ControlCenterView({
  orders,
  resources,
  apiKey,
}: {
  orders: ControlCenterItem[];
  resources: ControlCenterItem[];
  apiKey: string;
}) {
  const [tab, setTab] = useState<"orders" | "resources">("orders");
  const [filters, setFilters] = useState<ControlCenterFilters>(EMPTY_CONTROL_FILTERS);
  const [selectedId, setSelectedId] = useState<string>("");

  const all = useMemo(() => [...orders, ...resources], [orders, resources]);
  const filteredOrders = useMemo(() => filterControlCenterItems(orders, filters), [orders, filters]);
  const filteredResources = useMemo(() => filterControlCenterItems(resources, filters), [resources, filters]);
  const visible = tab === "orders" ? filteredOrders : filteredResources;
  const options = useMemo(() => controlCenterFilterOptions(all), [all]);
  const selected = all.find((item) => item.id === selectedId) ?? null;
  const points = useMemo(() => controlCenterPoints(visible), [visible]);

  function setFilter<K extends keyof ControlCenterFilters>(key: K, value: ControlCenterFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="control-center" data-control-center="">
      <div className="filter-pill-strip" data-control-filter-strip="">
        <FilterPills
          label="State"
          value={filters.state}
          options={options.states.map((state) => ({ value: state, label: state }))}
          onChange={(value) => setFilter("state", value)}
        />
        <FilterPills
          label="Equipment"
          value={filters.equipment}
          options={options.equipment}
          onChange={(value) => setFilter("equipment", value)}
        />
        <FilterPills
          label="Status"
          value={filters.status}
          options={options.statuses}
          onChange={(value) => setFilter("status", value)}
        />
      </div>
      <div className="control-center-body">
        <aside className="control-center-list card">
          <div className="control-center-tabs" role="tablist">
            <button
              type="button"
              className={`control-center-tab ${tab === "orders" ? "control-center-tab-active" : ""}`}
              onClick={() => setTab("orders")}
            >
              Orders ({filteredOrders.length})
            </button>
            <button
              type="button"
              className={`control-center-tab ${tab === "resources" ? "control-center-tab-active" : ""}`}
              onClick={() => setTab("resources")}
            >
              Resources ({filteredResources.length})
            </button>
          </div>
          <ul className="control-center-rows">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`control-center-row ${selectedId === item.id ? "control-center-row-active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{item.title}</span>
                    {item.kind === "load" ? <LoadStatusBadge status={item.status} /> : <span className="status-pill">{item.statusLabel}</span>}
                  </div>
                  <div className="text-xs text-slate-600">{item.subtitle}</div>
                  {item.origin ? (
                    <div className="control-legs">
                      <span>{item.origin}</span>
                      <span aria-hidden>→</span>
                      <span>{item.destination}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">{item.address || "No GPS yet"}</div>
                  )}
                </button>
              </li>
            ))}
            {visible.length === 0 ? <li className="px-3 py-6 text-sm text-slate-500">Nothing matches these filters.</li> : null}
          </ul>
        </aside>
        <section className="control-center-map card overflow-hidden">
          <LoadMapCanvas
            apiKey={apiKey}
            points={points}
            cluster
            onSelect={(point: LoadMapPoint) => setSelectedId(point.id)}
            className="h-[36rem] w-full bg-slate-100"
            missingKeyMessage="Map is off."
            emptyMessage="No pins for this filter."
          />
        </section>
        {selected ? (
          <aside className="control-center-detail card" data-control-detail="">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <p className="text-sm text-slate-600">{selected.subtitle}</p>
              </div>
              {selected.kind === "load" ? <LoadStatusBadge status={selected.status} /> : <span className="status-pill">{selected.statusLabel}</span>}
            </div>
            {selected.origin ? (
              <div className="control-legs mt-3">
                <span>{selected.origin}</span>
                <span aria-hidden>→</span>
                <span>{selected.destination}</span>
              </div>
            ) : null}
            <dl className="mt-3 grid gap-2 text-sm">
              {selected.address ? (
                <div>
                  <dt className="text-slate-500">Location</dt>
                  <dd>{selected.address}</dd>
                </div>
              ) : null}
              {selected.temperatureF != null ? (
                <div>
                  <dt className="text-slate-500">Temperature</dt>
                  <dd>{selected.temperatureF}°F{selected.setpointF != null ? ` · set ${selected.setpointF}°F` : ""}</dd>
                </div>
              ) : null}
              {selected.equipment ? (
                <div>
                  <dt className="text-slate-500">Equipment</dt>
                  <dd>{selected.equipment}</dd>
                </div>
              ) : null}
            </dl>
            <a className="btn btn-secondary mt-4 inline-flex" href={selected.href}>
              Open
            </a>
            <button className="btn btn-ghost mt-2" type="button" onClick={() => setSelectedId("")}>
              Close
            </button>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
