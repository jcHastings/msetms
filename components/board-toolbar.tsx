"use client";

import { useRouter } from "next/navigation";
import { LOAD_STATUSES, labelForLoadStatus } from "@/lib/types";

type Props = {
  status: string;
  date: string;
  q: string;
};

export function BoardToolbar({ status, date, q }: Props) {
  const router = useRouter();

  function update(next: Partial<Props>) {
    const params = new URLSearchParams();
    const merged = { status, date, q, ...next };
    if (merged.status && merged.status !== "active") params.set("status", merged.status);
    if (merged.date) params.set("date", merged.date);
    if (merged.q) params.set("q", merged.q);
    const query = params.toString();
    router.push(query ? `/board?${query}` : "/board");
  }

  return (
    <form
      className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        update({
          status: String(form.get("status") ?? "active"),
          date: String(form.get("date") ?? ""),
          q: String(form.get("q") ?? ""),
        });
      }}
    >
      <div className="field min-w-44 flex-1">
        <label htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Load #, customer, city, commodity" />
      </div>
      <div className="field w-44">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status}>
          <option value="active">Active</option>
          <option value="all">All</option>
          {LOAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {labelForLoadStatus(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field w-44">
        <label htmlFor="date">Pickup date</label>
        <input id="date" name="date" type="date" defaultValue={date} />
      </div>
      <button className="btn btn-secondary" type="submit">
        Filter
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => router.push("/board")}
      >
        Clear
      </button>
    </form>
  );
}
