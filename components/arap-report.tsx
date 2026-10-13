"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { ArApReportRow } from "@/lib/accounting-aging";

const RIGHT_KEYS = ["total", "paid", "current", "aging0to29", "aging30"] as const;
const COL_WIDTH_REM: Record<string, number> = {
  name: 14,
  total: 6.4,
  paid: 6.2,
  current: 6.2,
  aging0to29: 7.2,
  aging30: 5.8,
};

const AR_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "invoiceDate", label: "Invoice Date" },
  { key: "container", label: "Container Number" },
  { key: "loadNumber", label: "Load #" },
  { key: "reference", label: "Reference #" },
  { key: "terms", label: "Payment Terms" },
  { key: "dueDate", label: "Due Date" },
  { key: "daysPastDue", label: "Days Past Due" },
  { key: "total", label: "Invoice Totals" },
  { key: "paid", label: "Paid" },
  { key: "current", label: "Current" },
  { key: "aging0to29", label: "0-29 Days Past Due" },
  { key: "aging30", label: "30+ Day" },
] as const;

type ColumnKey = (typeof AR_COLUMNS)[number]["key"];

function matchesRow(row: ArApReportRow, q: string): boolean {
  if (!q.trim()) return true;
  const hay = [row.name, row.loadNumber, row.reference, String(row.total)].join(" ").toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}

export function ArapReport({ arRows, apRows }: { arRows: ArApReportRow[]; apRows: ArApReportRow[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [columns, setColumns] = useState<ColumnKey[]>(AR_COLUMNS.map((col) => col.key));
  const [showColumns, setShowColumns] = useState(false);
  const [apOpen, setApOpen] = useState(false);
  const ar = useMemo(() => arRows.filter((row) => matchesRow(row, q)), [arRows, q]);
  const ap = useMemo(() => apRows.filter((row) => matchesRow(row, q)), [apRows, q]);
  const exportHref =
    selected.length > 0
      ? `/api/accounting/arap/export?ids=${selected.join(",")}`
      : "/api/accounting/arap/export";

  function toggleAll(rows: ArApReportRow[]) {
    const ids = rows.map((row) => row.id);
    const allOn = ids.every((id) => selected.includes(id));
    setSelected(allOn ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  }

  function toggleOne(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold">Accounting Reports</h1>
        <button type="button" className="acct-link" onClick={() => setShowColumns((open) => !open)}>
          Customize Columns
        </button>
      </header>
      {showColumns ? (
        <div className="card flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[12.5px]">
          {AR_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={columns.includes(col.key)}
                onChange={() =>
                  setColumns((current) =>
                    current.includes(col.key) ? current.filter((key) => key !== col.key) : [...current, col.key],
                  )
                }
              />
              {col.label}
            </label>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Accounts Receivable</h2>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="search company name, invoice #, invoice dollar amount"
            className="min-w-[16rem] flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px]"
          />
          <div className="text-center text-[12.5px] text-slate-600">
            Selected {selected.length} Invoices
            <div>
              <button type="button" className="acct-link" onClick={() => setSelected([])}>
                Clear Selected Invoices
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            <Link href="/accounting/invoices" className="acct-link">
              Manage Invoices
            </Link>
            <a className="acct-link" href={exportHref}>
              Export Accounts Receivable to Excel
            </a>
          </div>
        </div>
        <AgingTable
          rows={ar}
          columns={columns}
          selected={selected}
          onToggleAll={() => toggleAll(ar)}
          onToggleOne={toggleOne}
        />
      </section>

      <section>
        <button type="button" className="mb-2 text-sm font-semibold acct-link" onClick={() => setApOpen((open) => !open)}>
          {apOpen ? "−" : "+"} Accounts Payable
        </button>
        {apOpen ? (
          <AgingTable
            rows={ap}
            columns={columns}
            selected={[]}
            onToggleAll={() => undefined}
            onToggleOne={() => undefined}
            hideSelect
          />
        ) : (
          <p className="text-[12.5px] text-slate-500">{ap.length} vendor bills. Expand to review aging.</p>
        )}
      </section>
    </div>
  );
}

function zoneClass(key: ColumnKey, hideSelect: boolean): string {
  if (key === "name") return hideSelect ? "zone-left" : "zone-left zone-left-arap-name";
  if ((RIGHT_KEYS as readonly string[]).includes(key)) return "zone-right";
  return "";
}

function zoneStyle(key: ColumnKey, visible: { key: ColumnKey }[]): CSSProperties | undefined {
  if (key === "name") {
    return { width: `${COL_WIDTH_REM.name}rem`, minWidth: `${COL_WIDTH_REM.name}rem` };
  }
  const rights = visible.filter((col) => (RIGHT_KEYS as readonly string[]).includes(col.key));
  const idx = rights.findIndex((col) => col.key === key);
  if (idx < 0) return undefined;
  const offset = rights.slice(idx + 1).reduce((sum, col) => sum + (COL_WIDTH_REM[col.key] ?? 6), 0);
  const width = COL_WIDTH_REM[key] ?? 6;
  return { right: `${offset}rem`, width: `${width}rem`, minWidth: `${width}rem` };
}

function agingTone(key: ColumnKey): string {
  if (key === "current") return "acct-aging-current";
  if (key === "aging0to29") return "acct-aging-29";
  if (key === "aging30") return "acct-aging-30";
  return "";
}

function AgingTable({
  rows,
  columns,
  selected,
  onToggleAll,
  onToggleOne,
  hideSelect = false,
}: {
  rows: ArApReportRow[];
  columns: ColumnKey[];
  selected: number[];
  onToggleAll: () => void;
  onToggleOne: (id: number) => void;
  hideSelect?: boolean;
}) {
  const visible = AR_COLUMNS.filter((col) => columns.includes(col.key));
  return (
    <div className="card overflow-x-auto">
      <table className="table-grid table-grid-acct table-zones min-w-max" data-table-zones="arap">
        <thead>
          <tr>
            {hideSelect ? null : (
              <th className="zone-left zone-left-0" style={{ width: "2.4rem", minWidth: "2.4rem" }}>
                <input type="checkbox" aria-label="Select all" onChange={onToggleAll} />
              </th>
            )}
            {visible.map((col) => (
              <th
                key={col.key}
                className={[zoneClass(col.key, hideSelect), agingTone(col.key)].filter(Boolean).join(" ") || undefined}
                style={zoneStyle(col.key, visible)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={visible.length + (hideSelect ? 0 : 1)} className="px-3 py-4 text-slate-500">
                No rows.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.kind}-${row.id}`}>
                {hideSelect ? null : (
                  <td className="zone-left zone-left-0" style={{ width: "2.4rem", minWidth: "2.4rem" }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={() => onToggleOne(row.id)}
                      aria-label={`Select ${row.name}`}
                    />
                  </td>
                )}
                {visible.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      zoneClass(col.key, hideSelect),
                      agingTone(col.key),
                      col.key === "total" || col.key === "paid" || col.key === "daysPastDue" || agingTone(col.key)
                        ? "text-right"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                    style={zoneStyle(col.key, visible)}
                  >
                    {cell(row, col.key)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function cell(row: ArApReportRow, key: ColumnKey) {
  switch (key) {
    case "name":
      return row.name;
    case "invoiceDate":
      return row.invoiceDateLabel;
    case "container":
      return row.containerNumber || "";
    case "loadNumber":
      return row.loadId ? (
        <Link href={`/loads/${row.loadId}`} className="acct-link">
          {row.loadNumber}
        </Link>
      ) : (
        row.loadNumber || "—"
      );
    case "reference":
      return row.reference || "";
    case "terms":
      return row.paymentTerms;
    case "dueDate":
      return row.dueDateLabel;
    case "daysPastDue":
      return row.daysPastDue;
    case "total":
      return formatMoney(row.total);
    case "paid":
      return formatMoney(row.paid);
    case "current":
      return formatMoney(row.current);
    case "aging0to29":
      return formatMoney(row.aging0to29);
    case "aging30":
      return formatMoney(row.aging30);
    default:
      return "";
  }
}
