"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HoverActionMenu } from "@/components/hover-action-menu";
import { useDismissable } from "@/components/use-dismissable";
import {
  flagLoadExceptionAction,
  logCheckCallFormAction,
  setStopAppointmentAction,
} from "@/lib/dispatcher-actions";
import { toInputDateTime } from "@/lib/format";

export type FastActionStop = {
  id: number;
  kind: "pickup" | "delivery";
  name: string;
  window_start: string;
  confirmation: string;
  schedule_type: string;
};

type DialogKind = "exception" | "appointment" | "update";

export function LoadCardFastActions({
  loadId,
  loadNumber,
  stops,
}: {
  loadId: number;
  loadNumber: string;
  stops: FastActionStop[];
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  useDismissable(Boolean(dialog), () => setDialog(null), panelRef);
  useEffect(() => setMounted(true), []);

  const firstStop = stops[0];
  const nowLocal = toInputDateTime(new Date().toISOString());

  return (
    <>
      <HoverActionMenu label="Actions" align="right" triggerClassName="btn btn-ghost">
        <button type="button" className="menu-item w-full text-left" onClick={() => setDialog("exception")}>
          Exception
        </button>
        <button type="button" className="menu-item w-full text-left" onClick={() => setDialog("appointment")}>
          Set appointment
        </button>
        <button type="button" className="menu-item w-full text-left" onClick={() => setDialog("update")}>
          Post update
        </button>
      </HoverActionMenu>
      {mounted && dialog
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" data-fast-action-dialog={dialog}>
              <form
                ref={panelRef}
                action={
                  dialog === "exception"
                    ? flagLoadExceptionAction
                    : dialog === "appointment"
                      ? setStopAppointmentAction
                      : logCheckCallFormAction
                }
                className="card w-full max-w-md p-4"
                onSubmit={() => setDialog(null)}
              >
                <h2 className="text-sm font-semibold">
                  {dialog === "exception"
                    ? `Exception · ${loadNumber}`
                    : dialog === "appointment"
                      ? `Set appointment · ${loadNumber}`
                      : `Post update · ${loadNumber}`}
                </h2>
                <input type="hidden" name="load_id" value={loadId} />
                {dialog === "exception" ? (
                  <div className="field mt-3">
                    <label htmlFor={`exception-note-${loadId}`}>What happened</label>
                    <textarea
                      id={`exception-note-${loadId}`}
                      name="note"
                      required
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Late to shipper, waiting on lumper…"
                    />
                  </div>
                ) : null}
                {dialog === "appointment" ? (
                  <div className="mt-3 grid gap-2">
                    <div className="field">
                      <label htmlFor={`appointment-stop-${loadId}`}>Stop</label>
                      <select id={`appointment-stop-${loadId}`} name="stop_id" required defaultValue={firstStop?.id ?? ""}>
                        {stops.length === 0 ? <option value="">No stops on this load</option> : null}
                        {stops.map((stop) => (
                          <option key={stop.id} value={stop.id}>
                            {stop.kind === "delivery" ? "Delivery" : "Pickup"}
                            {stop.name ? ` · ${stop.name}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`appointment-type-${loadId}`}>Schedule</label>
                      <select
                        id={`appointment-type-${loadId}`}
                        name="schedule_type"
                        defaultValue={firstStop?.schedule_type || "appointment"}
                      >
                        <option value="appointment">Appointment</option>
                        <option value="fcfs">FCFS</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`appointment-at-${loadId}`}>When</label>
                      <input
                        id={`appointment-at-${loadId}`}
                        name="appointment_at"
                        type="datetime-local"
                        defaultValue={toInputDateTime(firstStop?.window_start || "") || nowLocal}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`appointment-conf-${loadId}`}>Confirmation</label>
                      <input
                        id={`appointment-conf-${loadId}`}
                        name="confirmation"
                        defaultValue={firstStop?.confirmation ?? ""}
                        placeholder="Appt #"
                      />
                    </div>
                  </div>
                ) : null}
                {dialog === "update" ? (
                  <div className="mt-3 grid gap-2">
                    <div className="field">
                      <label htmlFor={`update-at-${loadId}`}>When</label>
                      <input
                        id={`update-at-${loadId}`}
                        name="called_at"
                        type="datetime-local"
                        defaultValue={nowLocal}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`update-notes-${loadId}`}>Update</label>
                      <input
                        id={`update-notes-${loadId}`}
                        name="notes"
                        required
                        placeholder="Rolling I-80, on time"
                      />
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-secondary" type="submit">
                    Save
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
