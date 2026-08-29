"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { FormBanner } from "@/components/form-banner";
import { useDismissable } from "@/components/use-dismissable";
import { makeBolAction } from "@/lib/actions";
import {
  BOL_COD_FEES,
  BOL_FREIGHT_CHARGES,
  BOL_HM_OPTIONS,
  BOL_PAPERWORK_NAME,
  BOL_REEFER_MODES,
  type BolDraft,
  type BolItemDraft,
  bolItemTotals,
  emptyBolItem,
  filledBolItems,
  formatBolTotal,
  joinBolSeals,
  splitBolSeals,
} from "@/lib/bol-shared";
import { formatDateTime } from "@/lib/format";
import { openPdfInNewTab } from "@/lib/open-generated-pdf";
import { labelForUploader, type Attachment } from "@/lib/types";

export function MakeBolPanel({
  loadId,
  attachments,
  prefill,
}: {
  loadId: number;
  attachments: Attachment[];
  prefill: BolDraft;
}) {
  const [state, formAction, pending] = useActionState(makeBolAction.bind(null, loadId), null);
  const [draft, setDraft] = useState(prefill);
  const [sealInputs, setSealInputs] = useState(() => splitBolSeals(prefill.seals));
  const [itemsOpen, setItemsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const itemsRef = useRef<HTMLDivElement>(null);
  useDismissable(itemsOpen, () => setItemsOpen(false), itemsRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setDraft(prefill);
    setSealInputs(splitBolSeals(prefill.seals));
  }, [prefill]);

  const bols = attachments.filter((file) => file.kind === "bol");
  const itemCount = filledBolItems(draft.items).length;
  const totals = useMemo(() => bolItemTotals(draft.items), [draft.items]);
  const thirdPartyChoices = useMemo(() => {
    const values = ["", BOL_PAPERWORK_NAME];
    if (draft.thirdParty && !values.includes(draft.thirdParty)) values.push(draft.thirdParty);
    return values;
  }, [draft.thirdParty]);

  function patch<K extends keyof BolDraft>(key: K, value: BolDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateSeals(next: string[]) {
    const seals = next.length > 0 ? next : [""];
    setSealInputs(seals);
    patch("seals", joinBolSeals(seals));
  }

  return (
    <section className="card mb-4 p-5" data-bol-panel="" data-ignore-dirty="">
      <h2 className="text-sm font-semibold">Bill of lading</h2>
      <p className="mt-1 text-sm text-slate-600">
        ITS-style BOL. Prefills from the load. Add freight lines, then print. Reefer, seals, and trailer stay their own
        fields — trailer is not stuffed into P.O. Number.
      </p>
      <FormBanner result={state} />
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="bol_items" value={JSON.stringify(draft.items)} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="BOL #">
            <input name="bol_number" value={draft.bolNumber} onChange={(event) => patch("bolNumber", event.target.value)} />
          </Field>
          <Field label="Load Number">
            <input
              name="bol_load_number"
              value={draft.loadNumber}
              onChange={(event) => patch("loadNumber", event.target.value)}
            />
          </Field>
          <Field label="Freight Charges">
            <select
              name="bol_freight_charges"
              value={draft.freightCharges}
              onChange={(event) => patch("freightCharges", event.target.value as BolDraft["freightCharges"])}
            >
              {BOL_FREIGHT_CHARGES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="3rd Party">
            <select name="bol_third_party" value={draft.thirdParty} onChange={(event) => patch("thirdParty", event.target.value)}>
              {thirdPartyChoices.map((option) => (
                <option key={option || "blank"} value={option}>
                  {option || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Driver">
            <input name="bol_driver" value={draft.driverName} onChange={(event) => patch("driverName", event.target.value)} />
          </Field>
          <Field label="Ship Date">
            <input name="bol_ship_date" value={draft.shipDate} onChange={(event) => patch("shipDate", event.target.value)} />
          </Field>
          <Field label="Delivery Date">
            <input
              name="bol_delivery_date"
              value={draft.deliveryDate}
              onChange={(event) => patch("deliveryDate", event.target.value)}
            />
          </Field>
          <Field label="Emergency #">
            <input
              name="bol_emergency"
              value={draft.emergencyPhone}
              onChange={(event) => patch("emergencyPhone", event.target.value)}
            />
          </Field>
          <Field label="P.O. Number">
            <input name="bol_po" value={draft.poNumber} onChange={(event) => patch("poNumber", event.target.value)} />
          </Field>
          <Field label="Trailer">
            <input
              name="bol_trailer"
              value={draft.trailerNumber}
              onChange={(event) => patch("trailerNumber", event.target.value)}
            />
          </Field>
          <Field label="Reefer setpoint °F">
            <input
              name="bol_reefer_setpoint"
              value={draft.reeferSetpoint}
              onChange={(event) => patch("reeferSetpoint", event.target.value)}
            />
          </Field>
          <Field label="Reefer mode">
            <select name="bol_reefer_mode" value={draft.reeferMode} onChange={(event) => patch("reeferMode", event.target.value)}>
              {BOL_REEFER_MODES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="C.O.D. Amount">
            <input name="bol_cod_amount" value={draft.codAmount} onChange={(event) => patch("codAmount", event.target.value)} />
          </Field>
          <Field label="C.O.D. Fee">
            <select
              name="bol_cod_fee"
              value={draft.codFee}
              onChange={(event) => patch("codFee", event.target.value as BolDraft["codFee"])}
            >
              {BOL_COD_FEES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Declared Value">
            <input
              name="bol_declared_value"
              value={draft.declaredValue}
              onChange={(event) => patch("declaredValue", event.target.value)}
            />
          </Field>
        </div>
        <fieldset className="rounded-lg border border-slate-200 p-3" data-bol-seals>
          <legend className="px-1 text-xs font-semibold text-slate-600">Seal numbers</legend>
          <input type="hidden" name="bol_seals" value={joinBolSeals(sealInputs)} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sealInputs.map((seal, index) => (
              <Field key={index} label={index === 0 ? "Seal number" : `Seal number ${index + 1}`}>
                <div className="flex gap-2">
                  <input
                    name="bol_seal"
                    value={seal}
                    onChange={(event) =>
                      updateSeals(sealInputs.map((current, i) => (i === index ? event.target.value : current)))
                    }
                    placeholder="Seal #"
                    data-bol-seal
                  />
                  {sealInputs.length > 1 ? (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => updateSeals(sealInputs.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </Field>
            ))}
          </div>
          <button
            className="btn btn-secondary mt-3"
            type="button"
            data-bol-add-seal
            onClick={() => updateSeals([...sealInputs, ""])}
          >
            Add seal
          </button>
        </fieldset>
        <div className="grid gap-3 lg:grid-cols-2">
          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-600">Origin</legend>
            <div className="grid gap-3">
              <Field label="Name">
                <input
                  name="bol_origin_name"
                  value={draft.originName}
                  onChange={(event) => patch("originName", event.target.value)}
                />
              </Field>
              <Field label="Address">
                <textarea
                  name="bol_origin_address"
                  rows={2}
                  value={draft.originAddress}
                  onChange={(event) => patch("originAddress", event.target.value)}
                />
              </Field>
              <Field label="Phone">
                <input
                  name="bol_origin_phone"
                  value={draft.originPhone}
                  onChange={(event) => patch("originPhone", event.target.value)}
                />
              </Field>
            </div>
          </fieldset>
          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-600">Destination</legend>
            <div className="grid gap-3">
              <Field label="Name">
                <input name="bol_dest_name" value={draft.destName} onChange={(event) => patch("destName", event.target.value)} />
              </Field>
              <Field label="Address">
                <textarea
                  name="bol_dest_address"
                  rows={2}
                  value={draft.destAddress}
                  onChange={(event) => patch("destAddress", event.target.value)}
                />
              </Field>
              <Field label="Phone">
                <input
                  name="bol_dest_phone"
                  value={draft.destPhone}
                  onChange={(event) => patch("destPhone", event.target.value)}
                />
              </Field>
            </div>
          </fieldset>
        </div>
        <Field label="Notes">
          <textarea name="bol_notes" rows={3} value={draft.notes} onChange={(event) => patch("notes", event.target.value)} />
        </Field>
        <p className="text-sm text-slate-600">
          Items {itemCount || 0}
          {totals.pieces || totals.weightLbs
            ? ` · ${formatBolTotal(totals.pieces) || 0} pieces · ${formatBolTotal(totals.weightLbs) || 0} lbs`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="button" data-bol-items onClick={() => setItemsOpen(true)}>
            ITEMS
          </button>
          <button className="btn btn-primary" type="submit" disabled={pending} data-bol-print>
            {pending ? "Printing BOL…" : "Print BOL"}
          </button>
        </div>
      </form>
      {itemsOpen && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" data-bol-items-overlay="" data-ignore-dirty="">
              <div ref={itemsRef} className="card mt-8 w-full max-w-5xl p-5" role="dialog" aria-label="BOL Items">
                <h3 className="text-base font-semibold">BOL Items</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="table-grid min-w-[720px] text-sm">
                    <thead>
                      <tr>
                        <th>Pieces</th>
                        <th>Description</th>
                        <th>Lbs</th>
                        <th>Type</th>
                        <th>NMFC</th>
                        <th>HM</th>
                        <th>Class</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <input
                              value={item.pieces}
                              onChange={(event) => updateItem(setDraft, index, { pieces: event.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={item.description}
                              onChange={(event) => updateItem(setDraft, index, { description: event.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={item.weightLbs}
                              onChange={(event) => updateItem(setDraft, index, { weightLbs: event.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={item.type}
                              onChange={(event) => updateItem(setDraft, index, { type: event.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={item.nmfc}
                              onChange={(event) => updateItem(setDraft, index, { nmfc: event.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              value={item.hm}
                              onChange={(event) =>
                                updateItem(setDraft, index, { hm: event.target.value as BolItemDraft["hm"] })
                              }
                            >
                              {BOL_HM_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={item.classCode}
                              onChange={(event) => updateItem(setDraft, index, { classCode: event.target.value })}
                            />
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  items: current.items.length > 1 ? current.items.filter((_, i) => i !== index) : [emptyBolItem()],
                                }))
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, items: [...current.items, emptyBolItem()] }))}
                  >
                    Add line
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => setItemsOpen(false)}>
                    OK
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {bols.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No BOL on this load yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {bols.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => openPdfInNewTab(`/api/attachments/${file.id}`)}
                >
                  {file.original_name}
                </button>
                <div className="text-xs text-slate-500">
                  BOL · {labelForUploader(file.uploaded_by)} · {formatDateTime(file.created_at)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary"
                  type="button"
                  data-bol-print-view=""
                  onClick={() => openPdfInNewTab(`/api/attachments/${file.id}`)}
                >
                  Print / view
                </button>
                <a className="btn btn-ghost" href={`/api/attachments/${file.id}?download=1`}>
                  Download
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function updateItem(
  setDraft: Dispatch<SetStateAction<BolDraft>>,
  index: number,
  patch: Partial<BolItemDraft>,
) {
  setDraft((current) => ({
    ...current,
    items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
  }));
}
