"use client";

import Link from "next/link";
import { useBoardFilter } from "@/components/board-filter";
import { isLoadListTab, LOAD_LIST_TABS, parseLoadListTab } from "@/lib/load-list-shared";
type Props = {
  status: string;
  date: string;
  includeArchived?: boolean;
  page?: number;
  pageCount?: number;
};

function allLoadsQuery(input: { date: string; includeArchived: boolean; page?: number }): string {
  const params = new URLSearchParams();
  params.set("status", "all");
  if (input.date) params.set("date", input.date);
  if (input.includeArchived) params.set("archived", "1");
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/board?${params.toString()}`;
}

export function BoardToolbar({
  status,
  date,
  includeArchived = false,
  page = 1,
  pageCount = 1,
}: Props) {
  const { q, setQ } = useBoardFilter();
  const currentTab = isLoadListTab(status) ? status : parseLoadListTab(status);

  function tabHref(value: string) {
    const params = new URLSearchParams();
    if (value !== "active") params.set("status", value);
    if (date) params.set("date", date);
    if (value === "all" && includeArchived) params.set("archived", "1");
    const query = params.toString();
    return query ? `/board?${query}` : "/board";
  }

  return (
    <div className="mb-3" data-load-list-chrome="">
      <div className="load-list-tabs" role="tablist" aria-label="Load Manager tabs">
        {LOAD_LIST_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={`load-tab ${currentTab === tab.value ? "load-tab-active" : ""}`}
            aria-label={tab.label}
            aria-current={currentTab === tab.value ? "page" : undefined}
          >
            <span className="load-tab-full">{tab.label}</span>
            <span className="load-tab-short" aria-hidden="true">
              {tab.short}
            </span>
          </Link>
        ))}
      </div>
      <form className="load-list-search" data-view-only-allow="" onSubmit={(event) => event.preventDefault()}>
        <div className="field min-w-56 flex-1">
          <label htmlFor="load-list-q">Search loads on this tab</label>
          <input
            id="load-list-q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Load #, customer, city, or reference"
          />
        </div>
        <div className="field w-44">
          <label htmlFor="date">Pickup date</label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={date}
            onChange={(event) => {
              const params = new URLSearchParams();
              if (status !== "active") params.set("status", status);
              if (event.target.value) params.set("date", event.target.value);
              if (currentTab === "all" && includeArchived) params.set("archived", "1");
              window.location.href = params.toString() ? `/board?${params}` : "/board";
            }}
          />
        </div>
        {currentTab === "all" ? (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm" htmlFor="include-archived">
              <input
                id="include-archived"
                type="checkbox"
                role="switch"
                aria-checked={includeArchived}
                checked={includeArchived}
                onChange={() => {
                  window.location.href = allLoadsQuery({ date, includeArchived: !includeArchived, page: 1 });
                }}
              />
              Include archived
            </label>
            {pageCount > 1 ? (
              <nav className="flex items-center gap-2 text-sm" aria-label="All Loads pages">
                {page > 1 ? (
                  <Link href={allLoadsQuery({ date, includeArchived, page: page - 1 })}>Previous</Link>
                ) : null}
                <span>
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <Link href={allLoadsQuery({ date, includeArchived, page: page + 1 })}>Next</Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
