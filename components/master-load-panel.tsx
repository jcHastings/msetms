"use client";

import { useActionState, useEffect, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { addMasterChildAction } from "@/lib/dispatcher-actions";
import { overlayHref } from "@/lib/load-page-shared";
import type { MasterFamilyMember } from "@/lib/master-load-shared";
import { childLoadNumber, nextChildSuffix } from "@/lib/master-load-shared";
import { requestLoadOverlay } from "@/components/page-overlay-host";
import { formatMoney } from "@/lib/format";

export type MasterStopChoice = {
  id: number;
  kind: string;
  name: string;
  city: string;
  state: string;
};

export function MasterLoadPanel({
  loadId,
  loadNumber,
  isChild,
  masterNumber,
  family,
  customers,
  stops,
  defaultCustomerId,
}: {
  loadId: number;
  loadNumber: string;
  isChild: boolean;
  masterNumber: string;
  family: MasterFamilyMember[];
  customers: Array<{ id: number; name: string }>;
  stops: MasterStopChoice[];
  defaultCustomerId: number;
}) {
  const [state, formAction, pending] = useActionState(addMasterChildAction, null);
  const [turnedOn, setTurnedOn] = useState(false);
  const children = family.filter((row) => row.parent_load_id);
  const isMaster = isChild || children.length > 0 || turnedOn;
  let nextSuffix = "A";
  try {
    nextSuffix = nextChildSuffix(children.map((row) => row.master_suffix));
  } catch {
    nextSuffix = "";
  }
  const nextNumber = nextSuffix ? childLoadNumber(masterNumber, nextSuffix) : "";
  const masterId = family.find((row) => !row.parent_load_id)?.id ?? loadId;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.replace(/^#/, "") === "master-load") setTurnedOn(true);
  }, []);

  function openMember(id: number) {
    const embed = new URLSearchParams(window.location.search).get("embed") === "1";
    if (embed && window.parent !== window) {
      window.parent.postMessage({ type: "ms-open-load", loadId: id }, window.location.origin);
      return;
    }
    if (new URL(window.location.href).searchParams.has("open")) {
      requestLoadOverlay(overlayHref("/board", id));
      return;
    }
    window.location.href = `/loads/${id}`;
  }

  return (
    <section className="card mb-4 overflow-hidden" id="master-load" data-master-load="">
      <div className="section-head px-5 py-3">
        <h2 className="text-sm font-semibold">Master load</h2>
      </div>
      <div className="space-y-4 p-5 text-sm">
        {!isMaster ? (
          <div className="space-y-3" data-master-opt-in="">
            <p className="text-slate-600">This load is not a master. Turn it into one to bill more than one customer on the same trip.</p>
            <button className="btn btn-secondary" type="button" data-master-turn-on="" onClick={() => setTurnedOn(true)}>
              Turn into a master load
            </button>
          </div>
        ) : (
          <>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {family.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <button
                  type="button"
                  className="font-mono font-semibold text-sky-800 underline"
                  data-master-open={row.id}
                  onClick={() => openMember(row.id)}
                >
                  {row.load_number}
                </button>
                <div className="text-xs text-slate-500">
                  {row.parent_load_id
                    ? `Customer split ${row.master_suffix}`
                    : children.length
                      ? "Master · trip"
                      : "This trip"}
                  {row.customer_name ? ` · ${row.customer_name}` : ""}
                  {row.rate != null ? ` · ${formatMoney(row.rate)}` : ""}
                </div>
              </div>
              {row.id === loadId ? <span className="text-xs font-semibold text-slate-500">This load</span> : null}
            </li>
          ))}
        </ul>
        {isChild ? (
          <p className="text-slate-600">
            Add or change customer splits on the master{" "}
            <button type="button" className="font-mono text-sky-800 underline" onClick={() => openMember(masterId)}>
              {masterNumber}
            </button>
            .
          </p>
        ) : (
          <form action={formAction} className="space-y-3" data-master-add="">
            <FormBanner result={state} />
            <input type="hidden" name="parent_load_id" value={loadId} />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Next split {nextNumber}
            </p>
            <div className="field">
              <label htmlFor="master_customer_id">Customer</label>
              <select
                id="master_customer_id"
                name="customer_id"
                required
                defaultValue={children.length ? "" : defaultCustomerId}
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Stops for this customer
              </legend>
              <div className="space-y-2">
                {stops.map((stop) => (
                  <label key={stop.id} className="flex items-start gap-2">
                    <input type="checkbox" name="stop_ids" value={stop.id} defaultChecked />
                    <span>
                      <span className="font-medium">{stop.kind === "delivery" ? "Delivery" : "Pickup"}</span>
                      {" · "}
                      {stop.name}
                      {stop.city ? ` · ${[stop.city, stop.state].filter(Boolean).join(", ")}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field max-w-xs">
              <label htmlFor="master_rate">Customer rate</label>
              <input id="master_rate" name="rate" inputMode="decimal" placeholder="0.00" />
            </div>
            {!children.length ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="copy_financials" value="1" defaultChecked />
                Copy this load’s customer pay lines onto the first split
              </label>
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={pending || !nextNumber} data-master-add-submit="">
              {pending ? "Adding…" : nextNumber ? `Add ${nextNumber}` : "A through Z are used"}
            </button>
          </form>
        )}
          </>
        )}
      </div>
    </section>
  );
}
