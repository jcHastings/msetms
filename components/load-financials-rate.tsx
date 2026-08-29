"use client";

import { useState } from "react";
import { LoadRateFields } from "@/components/load-rate-fields";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import { isOwnerOperator, type Load } from "@/lib/types";

export function LoadFinancialsRate({
  load,
  driverType,
  defaultOoPercent,
}: {
  load: Load;
  driverType?: string | null;
  defaultOoPercent?: number | null;
}) {
  const { persistFields } = useLoadAssignPersist(load.id);
  const ownerOperator = isOwnerOperator(driverType);
  const [ooPercent, setOoPercent] = useState<number | null>(
    ownerOperator ? (load.oo_percent ?? defaultOoPercent ?? null) : null,
  );

  return (
    <section className="card mb-4 overflow-hidden" data-financials-rate="">
      <div className="section-head px-5 py-3">
        <h2 className="text-sm font-semibold">Customer rate</h2>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <p className="md:col-span-2 text-sm text-slate-600">
          Rate and OO pay live here — not on Load Basics. Income lines below are extras (detention, fuel, lumpers).
        </p>
        <LoadRateFields load={load} ooPercent={ooPercent} onOoPercentChange={setOoPercent} />
        <div className="field">
          <label htmlFor="non_revenue">Empty move</label>
          <select
            id="non_revenue"
            name="non_revenue"
            data-critical-save=""
            defaultValue={load.non_revenue ? "1" : "0"}
            onChange={(event) => {
              void persistFields({ non_revenue: event.target.value });
            }}
          >
            <option value="0">Revenue load</option>
            <option value="1">Non-revenue — pay and miles, no customer invoice</option>
          </select>
        </div>
      </div>
    </section>
  );
}
