"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { matchStateLabel, type PaystubPreviewRow, type PaystubQueueRow } from "@/lib/paystub-shared";

type DriverOption = { id: number; name: string };

type EditableRow = {
  key: string;
  fileName: string;
  employeeName: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  gross: string;
  net: string;
  matchState: string;
  driverId: number | null;
  reason: string;
  locked: boolean;
  skip: boolean;
};

type QueueEdit = EditableRow & { id: number };

function badgeClass(state: string): string {
  if (state === "matched" || state === "overridden") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (state === "duplicate_file" || state === "duplicate_pay_date") return "border-rose-300 bg-rose-50 text-rose-950";
  if (state === "owner_operator") return "border-slate-300 bg-slate-100 text-slate-800";
  return "border-amber-300 bg-amber-50 text-amber-950";
}

function toEditable(row: PaystubPreviewRow): EditableRow {
  return { ...row, skip: false };
}

function toQueue(row: PaystubQueueRow): QueueEdit {
  return {
    key: `queue-${row.id}`,
    id: row.id,
    fileName: row.fileName,
    employeeName: row.employeeName,
    payDate: row.payDate,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    gross: row.gross,
    net: row.net,
    matchState: row.matchState,
    driverId: row.suggestedDriverId,
    reason: row.reason,
    locked: row.matchState === "duplicate_file",
    skip: false,
  };
}

export function PaystubUpload({
  canWrite,
  drivers,
  queue,
  ownerNote,
}: {
  canWrite: boolean;
  drivers: DriverOption[];
  queue: PaystubQueueRow[];
  ownerNote: string;
}) {
  const router = useRouter();
  const fileInputId = useId();
  const summaryInputId = useId();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [summaryName, setSummaryName] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [queueRows, setQueueRows] = useState<QueueEdit[]>(() => queue.map(toQueue));
  const queueKey = queue.map((row) => `${row.id}:${row.reason}:${row.suggestedDriverId ?? ""}`).join("|");

  useEffect(() => {
    setQueueRows(queue.map(toQueue));
  }, [queueKey, queue]);

  async function readFiles(fileList: File[], summary: File | null) {
    if (!canWrite) return;
    setError("");
    setNotice("");
    setBusy("read");
    const body = new FormData();
    for (const file of fileList) body.append("file", file);
    if (summary) body.append("summary", summary);
    try {
      const response = await fetch("/api/paystubs/preview", { method: "POST", body });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        previewId?: string;
        summaryName?: string;
        rows?: PaystubPreviewRow[];
      };
      if (!response.ok || !payload.ok || !payload.previewId) {
        setError(payload.error || "Could not read those PDFs.");
        return;
      }
      setPreviewId(payload.previewId);
      setSummaryName(payload.summaryName || "");
      setRows((payload.rows ?? []).map(toEditable));
      setNotice(`${payload.rows?.length ?? 0} ${payload.rows?.length === 1 ? "file" : "files"} ready to review. Nothing is saved yet.`);
    } catch {
      setError("Could not read those PDFs.");
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    if (!canWrite) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/paystubs/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: previewId || undefined,
          rows: rows.map((row) => ({
            key: row.key,
            driverId: row.driverId,
            employeeName: row.employeeName,
            payDate: row.payDate,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            gross: row.gross,
            net: row.net,
            skip: row.skip || row.locked,
          })),
          queue: queueRows.map((row) => ({
            id: row.id,
            driverId: row.driverId,
            employeeName: row.employeeName,
            payDate: row.payDate,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            gross: row.gross,
            net: row.net,
            skip: row.skip,
          })),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        saved?: number;
        results?: Array<{ file: string; status: string; reason?: string }>;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error || "Could not save paystubs.");
        return;
      }
      const failed = new Set(
        (payload.results ?? [])
          .filter((item) => item.status !== "stored" && item.reason !== "Skipped.")
          .map((item) => item.file),
      );
      setRows((current) =>
        current
          .filter((row) => failed.has(row.fileName) && !row.skip && !row.locked)
          .map((row) => {
            const result = payload.results?.find((item) => item.file === row.fileName && item.status !== "stored");
            return result?.reason ? { ...row, reason: result.reason, matchState: result.status === "duplicate" ? "duplicate_pay_date" : row.matchState } : row;
          }),
      );
      if (rows.every((row) => row.skip || row.locked || !failed.has(row.fileName))) setPreviewId("");
      setNotice(`Saved ${payload.saved ?? 0} ${(payload.saved ?? 0) === 1 ? "paystub" : "paystubs"}.`);
      router.refresh();
    } catch {
      setError("Could not save paystubs.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note">
        {ownerNote} They are not in the driver list.
      </p>
      {!canWrite ? (
        <p className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800" role="status">
          View-only access. You can look. Upload, assign, and save stay off.
        </p>
      ) : null}

      <section className="card p-6" aria-labelledby="paystub-upload-heading">
        <h2 id="paystub-upload-heading" className="text-base font-semibold text-slate-900">
          Upload paystubs
        </h2>
        <p className="mt-1 text-sm text-slate-600">Add every driver PDF from this payday. The payroll summary is optional.</p>
        <div
          className={`mt-4 rounded-lg border-2 border-dashed px-4 py-8 text-center focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_rgba(19,124,221,0.16)] ${
            dragging ? "border-[var(--accent)] bg-sky-50" : "border-slate-300 bg-slate-50"
          } ${canWrite ? "" : "opacity-60"}`}
          onDragEnter={(event) => {
            if (!canWrite) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            if (!canWrite) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!canWrite) return;
            const pdfs = [...event.dataTransfer.files].filter((file) => file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf");
            const summaryInput = document.getElementById(summaryInputId);
            const summary = summaryInput instanceof HTMLInputElement ? summaryInput.files?.[0] ?? null : null;
            if (pdfs.length) void readFiles(pdfs, summary);
            else setError("Drop PDF paystubs. The summary file uses the field below.");
          }}
          data-paystub-dropzone=""
          aria-disabled={canWrite ? undefined : true}
        >
          <label htmlFor={fileInputId} className="inline-flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1">
            <span className="text-sm font-semibold text-slate-900">{busy === "read" ? "Reading PDFs…" : "Drop paystub PDFs here"}</span>
            <span className="text-sm text-slate-600">or choose files. You can add many at once.</span>
          </label>
          <input
            id={fileInputId}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={!canWrite || busy !== null}
            data-view-only={canWrite ? undefined : ""}
            onChange={(event) => {
              const pdfs = [...(event.target.files ?? [])];
              const summaryInput = document.getElementById(summaryInputId);
              const summary = summaryInput instanceof HTMLInputElement ? summaryInput.files?.[0] ?? null : null;
              if (pdfs.length) void readFiles(pdfs, summary);
              event.target.value = "";
            }}
          />
        </div>
        <div className="field mt-4 max-w-md">
          <label htmlFor={summaryInputId}>Payroll summary (optional PDF or CSV)</label>
          <input
            id={summaryInputId}
            type="file"
            accept="application/pdf,.pdf,text/csv,.csv"
            disabled={!canWrite || busy !== null}
            data-view-only={canWrite ? undefined : ""}
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950" role="status">
          {notice}
        </p>
      ) : null}

      <section className="card p-6" aria-labelledby="paystub-review-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="paystub-review-heading" className="text-base font-semibold text-slate-900">
              Review before saving
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {summaryName ? `Summary ${summaryName} stays with this pay run. ` : ""}
              Unmatched rows must be assigned or skipped. A low-confidence name is never saved on its own.
            </p>
          </div>
          <button
            className="btn btn-primary min-h-11"
            type="button"
            onClick={() => void onSave()}
            disabled={!canWrite || busy !== null || (rows.length === 0 && queueRows.length === 0)}
            data-view-only={canWrite ? undefined : ""}
          >
            {busy === "save" ? "Saving…" : "Save paystubs"}
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-600" role="status">
            No upload is waiting. Drop PDFs above to review them.
          </p>
        ) : (
          <ReviewTable
            rows={rows}
            drivers={drivers}
            canWrite={canWrite && busy === null}
            onChange={(key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))}
          />
        )}
      </section>

      <section className="card p-6" aria-labelledby="paystub-queue-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="paystub-queue-heading" className="text-base font-semibold text-slate-900">
              Needs review
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Files that were not confidently matched, including uploads from the script. They are not on a driver until you save them here.
            </p>
          </div>
          <button
            className="btn btn-primary min-h-11"
            type="button"
            onClick={() => void onSave()}
            disabled={!canWrite || busy !== null || queueRows.length === 0}
            data-view-only={canWrite ? undefined : ""}
          >
            {busy === "save" ? "Saving…" : "Save review queue"}
          </button>
        </div>
        {queueRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600" role="status">
            Nothing is waiting for review.
          </p>
        ) : (
          <div className="mt-3">
            <ReviewTable
              rows={queueRows}
              drivers={drivers}
              canWrite={canWrite && busy === null}
              onChange={(key, patch) =>
                setQueueRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewTable({
  rows,
  drivers,
  canWrite,
  onChange,
}: {
  rows: EditableRow[];
  drivers: DriverOption[];
  canWrite: boolean;
  onChange: (key: string, patch: Partial<EditableRow>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table-grid min-w-[920px] w-full text-sm" data-paystub-review="">
        <caption className="sr-only">Paystubs to review</caption>
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">Match</th>
            <th scope="col">Driver</th>
            <th scope="col">Pay date</th>
            <th scope="col">Period start</th>
            <th scope="col">Period end</th>
            <th scope="col">Gross</th>
            <th scope="col">Net</th>
            <th scope="col">Skip</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const reasonId = `${row.key}-reason`;
            return (
              <tr key={row.key} data-match-state={row.matchState}>
                <th scope="row" className="align-top text-left font-semibold text-slate-900">
                  <span className="block max-w-[12rem] truncate" title={row.fileName}>
                    {row.fileName}
                  </span>
                  <label className="mt-2 block text-xs font-medium text-slate-500" htmlFor={`${row.key}-name`}>
                    Employee name
                  </label>
                  <input
                    id={`${row.key}-name`}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    value={row.employeeName}
                    disabled={!canWrite || row.locked}
                    data-view-only={canWrite ? undefined : ""}
                    onChange={(event) => onChange(row.key, { employeeName: event.target.value })}
                  />
                </th>
                <td className="align-top">
                  <span className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${badgeClass(row.matchState)}`}>
                    {matchStateLabel(row.matchState)}
                  </span>
                  {row.reason ? (
                    <p id={reasonId} className="mt-2 max-w-[16rem] text-xs text-slate-600">
                      {row.reason}
                    </p>
                  ) : null}
                </td>
                <td className="align-top">
                  <DriverPicker
                    labelledBy={`${row.key}-driver-label`}
                    label="Driver"
                    value={row.driverId}
                    drivers={drivers}
                    disabled={!canWrite || row.locked}
                    onChange={(driverId) => onChange(row.key, { driverId })}
                  />
                </td>
                <td className="align-top">
                  <DateField id={`${row.key}-pay-date`} label="Pay date" value={row.payDate} disabled={!canWrite || row.locked} describedBy={reasonId} onChange={(payDate) => onChange(row.key, { payDate })} />
                </td>
                <td className="align-top">
                  <DateField id={`${row.key}-start`} label="Period start" value={row.periodStart} disabled={!canWrite || row.locked} describedBy={reasonId} onChange={(periodStart) => onChange(row.key, { periodStart })} />
                </td>
                <td className="align-top">
                  <DateField id={`${row.key}-end`} label="Period end" value={row.periodEnd} disabled={!canWrite || row.locked} describedBy={reasonId} onChange={(periodEnd) => onChange(row.key, { periodEnd })} />
                </td>
                <td className="align-top">
                  <MoneyField id={`${row.key}-gross`} label="Gross" value={row.gross} disabled={!canWrite || row.locked} describedBy={reasonId} onChange={(gross) => onChange(row.key, { gross })} />
                </td>
                <td className="align-top">
                  <MoneyField id={`${row.key}-net`} label="Net" value={row.net} disabled={!canWrite || row.locked} describedBy={reasonId} onChange={(net) => onChange(row.key, { net })} />
                </td>
                <td className="align-top">
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm" htmlFor={`${row.key}-skip`}>
                    <input
                      id={`${row.key}-skip`}
                      type="checkbox"
                      checked={row.skip}
                      disabled={!canWrite || row.locked}
                      data-view-only={canWrite ? undefined : ""}
                      onChange={(event) => onChange(row.key, { skip: event.target.checked })}
                    />
                    Skip
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DateField({
  id,
  label,
  value,
  disabled,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  describedBy: string;
  onChange: (value: string) => void;
}) {
  const missing = !value;
  return (
    <div className="field min-w-[9rem]">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        disabled={disabled}
        data-view-only={disabled ? "" : undefined}
        aria-invalid={missing || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function MoneyField({
  id,
  label,
  value,
  disabled,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  describedBy: string;
  onChange: (value: string) => void;
}) {
  const missing = !value;
  return (
    <div className="field min-w-[7rem]">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        data-view-only={disabled ? "" : undefined}
        aria-invalid={missing || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DriverPicker({
  label,
  labelledBy,
  value,
  drivers,
  disabled,
  onChange,
}: {
  label: string;
  labelledBy: string;
  value: number | null;
  drivers: DriverOption[];
  disabled: boolean;
  onChange: (driverId: number | null) => void;
}) {
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = drivers.find((driver) => driver.id === value) ?? null;
  const options: Array<{ id: number | null; name: string }> = [{ id: null, name: "Unassigned" }, ...drivers.map((driver) => ({ id: driver.id, name: driver.name }))];

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) });
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    setOpen(false);
  }

  return (
    <div className="field min-w-[12rem]">
      <span id={labelledBy} className="text-xs font-semibold text-slate-500">
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        className="min-h-11 rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        data-view-only={disabled ? "" : undefined}
        data-driver-picker=""
        onClick={() => {
          if (disabled) return;
          setActive(Math.max(0, options.findIndex((option) => option.id === value)));
          place();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              place();
              setOpen(true);
            }
            setActive((current) => {
              const next = event.key === "ArrowDown" ? current + 1 : current - 1;
              return Math.min(options.length - 1, Math.max(0, next));
            });
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(active);
          } else if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "Home") {
            setActive(0);
          } else if (event.key === "End") {
            setActive(options.length - 1);
          }
        }}
      >
        {selected ? selected.name : "Assign a driver"}
      </button>
      {open && box ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          className="max-h-60 overflow-auto rounded-lg border border-slate-300 bg-white py-1 shadow-lg"
          style={{ position: "fixed", top: box.top, left: box.left, width: box.width, zIndex: 40 }}
        >
          {options.map((option, index) => {
            const selectedOption = option.id === value;
            return (
              <li
                key={option.id ?? "none"}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selectedOption}
                className={`min-h-11 cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-sky-100 text-slate-950" : "text-slate-900"} ${selectedOption ? "font-semibold" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
              >
                {option.name}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
