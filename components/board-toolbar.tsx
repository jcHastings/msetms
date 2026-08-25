"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LOAD_LIST_TABS } from "@/lib/load-list-shared";

type Props = {
  status: string;
  date: string;
};

export function BoardToolbar({ status, date }: Props) {
  const [q, setQ] = useState("");

  useEffect(() => {
    const term = q.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>("[data-load-search]").forEach((row) => {
      const hay = (row.dataset.loadSearch ?? "").toLowerCase();
      row.hidden = Boolean(term) && !hay.includes(term);
    });
  }, [q]);

  function tabHref(value: string) {
    const params = new URLSearchParams();
    if (value !== "active") params.set("status", value);
    if (date) params.set("date", date);
    const query = params.toString();
    return query ? `/board?${query}` : "/board";
  }

  return (
    <div className="card mb-4 px-4 py-3" data-load-list-chrome="">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {LOAD_LIST_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={`load-tab rounded-t-md px-3 py-2 text-sm font-semibold ${
              status === tab.value ? "load-tab-active" : ""
            }`}
            aria-current={status === tab.value ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
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
