"use client";

import Link from "next/link";
import { useBoardFilter } from "@/components/board-filter";
import { isLoadListTab, LOAD_LIST_TABS, parseLoadListTab } from "@/lib/load-list-shared";

type Props = {
  status: string;
  date: string;
};

export function BoardToolbar({ status, date }: Props) {
  const { q, setQ } = useBoardFilter();
  const currentTab = isLoadListTab(status) ? status : parseLoadListTab(status);

  function tabHref(value: string) {
    const params = new URLSearchParams();
    if (value !== "active") params.set("status", value);
    if (date) params.set("date", date);
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
            aria-current={currentTab === tab.value ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <form className="load-list-search" onSubmit={(event) => event.preventDefault()}>
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
              window.location.href = params.toString() ? `/board?${params}` : "/board";
            }}
          />
        </div>
      </form>
    </div>
  );
}
