"use client";

import { useState, type ReactNode } from "react";

export function DriverDispatchBoard({
  active,
  delivered,
}: {
  active: ReactNode;
  delivered: ReactNode;
}) {
  const [filter, setFilter] = useState<"active" | "delivered">("active");

  return (
    <section id="dispatch" className="mt-4" data-driver-dispatch="" data-dispatch-filter={filter}>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          data-dispatch-filter="active"
          onClick={() => setFilter("active")}
          className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold ${
            filter === "active" ? "bg-white text-slate-900" : "bg-slate-800 text-slate-200"
          }`}
        >
          Active
        </button>
        <button
          type="button"
          data-dispatch-filter="delivered"
          onClick={() => setFilter("delivered")}
          className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold ${
            filter === "delivered" ? "bg-white text-slate-900" : "bg-slate-800 text-slate-200"
          }`}
        >
          Delivered
        </button>
      </div>
      {filter === "active" ? active : delivered}
    </section>
  );
}
