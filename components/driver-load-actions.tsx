"use client";

import { useEffect, useState } from "react";
import { DriverUpload } from "@/components/driver-upload";
import { driverStopCheckAction } from "@/lib/driver-actions";
import { driverStopButtons, type DriverStopButton } from "@/lib/driver-stops";
import { POD_DELIVERY_REASONS, type PodDeliveryReason } from "@/lib/pod-delivery-shared";
import type { LoadStop } from "@/lib/stops";
import { labelForDriverProgress } from "@/lib/types";

function marksDelivered(button: DriverStopButton): boolean {
  return button.stopLabel === "Delivery" && button.kind === "depart";
}

function buttonText(button: DriverStopButton): string {
  if (marksDelivered(button)) return "Delivered";
  const verb = button.kind === "arrive" ? "Check In" : "Check Out";
  const wait =
    !button.enabled && button.stopLabel === "Delivery" && button.kind === "arrive"
      ? " · after pickup check out"
      : "";
  return `${button.stopLabel} ${verb}${wait}`;
}

export function DriverLoadActions({
  loadId,
  loadNumber,
  current,
  closed,
  stops,
  hasPod = false,
}: {
  loadId: number;
  loadNumber: string;
  current: string;
  closed: boolean;
  stops: LoadStop[];
  hasPod?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [podStop, setPodStop] = useState<DriverStopButton | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState("");
  const [podOnFile, setPodOnFile] = useState(hasPod);
  const buttons = driverStopButtons(stops);

  useEffect(() => {
    setPodOnFile(hasPod);
  }, [hasPod]);

  useEffect(() => {
    if (!podStop) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setPodStop(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [podStop, pending]);

  async function submit(
    button: DriverStopButton,
    pod?: { outcome: "photo" | "reason"; reason?: PodDeliveryReason; note?: string },
  ): Promise<boolean> {
    if (!button.enabled || pending || closed) return false;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    form.set("stop_id", String(button.stopId));
    form.set("kind", button.kind);
    if (pod?.outcome === "photo") form.set("pod_outcome", "photo");
    if (pod?.outcome === "reason" && pod.reason) {
      form.set("pod_outcome", "reason");
      form.set("pod_reason", pod.reason);
      if (pod.note) form.set("pod_note", pod.note);
    }
    const result = await driverStopCheckAction(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setPodStop(null);
    setOtherOpen(false);
    setNote("");
    return true;
  }

  function onButton(button: DriverStopButton) {
    if (!button.enabled || pending || closed) return;
    if (marksDelivered(button)) {
      setError(null);
      setOtherOpen(false);
      setNote("");
      setPodStop(button);
      return;
    }
    void submit(button);
  }

  async function saveReason(reason: PodDeliveryReason, reasonNote = "") {
    if (!podStop) return;
    await submit(podStop, { outcome: "reason", reason, note: reasonNote });
  }

  return (
    <section className="mt-5 space-y-3">
      <h2 className="text-base font-semibold text-white">Check in / check out</h2>
      {buttons.map((button) => (
        <button
          key={`${button.stopId}-${button.kind}`}
          type="button"
          disabled={pending || closed || !button.enabled}
          aria-disabled={pending || closed || !button.enabled}
          onClick={() => onButton(button)}
          className={`min-h-14 w-full rounded-2xl px-4 text-left text-lg font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            button.enabled && !closed ? "bg-navy text-white" : "bg-slate-200 text-slate-500"
          }`}
        >
          {buttonText(button)}
        </button>
      ))}

      <DriverUpload loadId={loadId} loadNumber={loadNumber} />
      {error && !podStop ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {current ? (
        <p className="text-sm text-slate-500">Current: {labelForDriverProgress(current)}</p>
      ) : null}

      {podStop ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pod-delivery-title"
            data-pod-delivery-sheet=""
            className="mx-auto min-h-full w-full max-w-lg bg-white px-4 pb-10 pt-5 text-slate-900"
          >
            <h2 id="pod-delivery-title" className="text-2xl font-semibold">
              Proof of delivery
            </h2>
            <p className="mt-1 text-base text-slate-700">
              Mark {loadNumber} delivered. Take the POD photo, or pick why it is not on this phone.
            </p>

            <div className="mt-4">
              <DriverUpload
                loadId={loadId}
                loadNumber={loadNumber}
                lockedKind="pod"
                title="POD photo"
                intro="Camera or a file. This uses the same upload as the rest of the load."
                onUploaded={() => {
                  setPodOnFile(true);
                  if (!podStop) return;
                  void submit(podStop, { outcome: "photo" });
                }}
              />
            </div>

            {podOnFile ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void submit(podStop, { outcome: "photo" })}
                className="mt-3 min-h-14 w-full rounded-2xl bg-navy px-4 text-lg font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                POD is already on this load
              </button>
            ) : null}

            <h3 className="mt-5 text-base font-semibold">No photo</h3>
            <div className="mt-2 space-y-2" data-pod-reason-list="">
              {POD_DELIVERY_REASONS.filter((item) => item.value !== "other").map((item) => (
                <button
                  key={item.value}
                  type="button"
                  data-pod-reason={item.value}
                  disabled={pending}
                  onClick={() => void saveReason(item.value)}
                  className="min-h-14 w-full rounded-2xl bg-slate-100 px-4 text-left text-lg font-semibold text-slate-900 ring-1 ring-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                data-pod-reason="other"
                aria-expanded={otherOpen}
                disabled={pending}
                onClick={() => setOtherOpen(true)}
                className="min-h-14 w-full rounded-2xl bg-slate-100 px-4 text-left text-lg font-semibold text-slate-900 ring-1 ring-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                Other
              </button>
              {otherOpen ? (
                <div className="space-y-2">
                  <label htmlFor="pod-other-note" className="block text-sm font-medium text-slate-800">
                    Short note
                  </label>
                  <textarea
                    id="pod-other-note"
                    value={note}
                    maxLength={160}
                    rows={2}
                    onChange={(event) => setNote(event.target.value)}
                    className="min-h-14 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
                  />
                  <button
                    type="button"
                    disabled={pending || !note.trim()}
                    onClick={() => void saveReason("other", note)}
                    className="min-h-14 w-full rounded-2xl bg-navy px-4 text-lg font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    Save note and mark delivered
                  </button>
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="mt-3 text-sm text-rose-700" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={pending}
              onClick={() => setPodStop(null)}
              className="mt-6 min-h-14 w-full rounded-2xl bg-white text-lg font-semibold text-slate-800 ring-1 ring-slate-300"
            >
              Not yet
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
