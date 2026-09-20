"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentPreview, type DocumentPreviewItem } from "@/components/document-preview";
import { useLoadEdit } from "@/components/load-edit-context";
import type { DefaultedDocumentRow } from "@/lib/load-documents-shared";
import { formatDateTime } from "@/lib/format";

export function DefaultedDocuments({
  loadId,
  loadNumber,
  documents,
}: {
  loadId: number;
  loadNumber: string;
  documents: DefaultedDocumentRow[];
}) {
  const router = useRouter();
  const edit = useLoadEdit();
  const preview = useDocumentPreview();
  const [rows, setRows] = useState(documents);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    setRows(documents);
  }, [documents]);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.title, row.source, row.description, row.attachedTo].join(" ").toLowerCase().includes(q),
    );
  }, [filter, rows]);

  const siblings = (): DocumentPreviewItem[] =>
    rows
      .filter((row) => row.attachmentId)
      .map((row) => ({
        attachmentId: row.attachmentId as number,
        title: row.title,
        description: row.description,
      }));

  async function openRow(row: DefaultedDocumentRow) {
    setError("");
    setPendingKey(`${row.key}:${row.stopId ?? ""}`);
    try {
      let attachmentId = row.attachmentId;
      if (!attachmentId) {
        const response = await fetch(`/api/loads/${loadId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: row.key, stopId: row.stopId }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "Could not generate that document.");
        }
        const body = (await response.json()) as { attachmentId: number; documents?: DefaultedDocumentRow[] };
        attachmentId = body.attachmentId;
        if (body.documents) setRows(body.documents);
        router.refresh();
      }
      if (!attachmentId) throw new Error("That document did not save.");
      preview?.openPreview(
        { attachmentId, title: row.title, description: row.description },
        siblings().some((item) => item.attachmentId === attachmentId)
          ? siblings()
          : [
              ...siblings(),
              { attachmentId, title: row.title, description: row.description },
            ],
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open that document.");
    } finally {
      setPendingKey("");
    }
  }

  async function generateAll() {
    setError("");
    setPendingKey("all");
    try {
      const response = await fetch(`/api/loads/${loadId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "Could not generate the default documents.");
      }
      const body = (await response.json()) as { documents: DefaultedDocumentRow[] };
      setRows(body.documents);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the default documents.");
    } finally {
      setPendingKey("");
    }
  }

  return (
    <section className="card mb-4 overflow-hidden" id="defaulted-documents" data-defaulted-documents="">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <h2 className="text-sm font-semibold">Your defaulted documents</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" type="button" onClick={() => edit?.setTab("docs", "load-documents")}>
            + Upload a new doc
          </button>
          <button className="btn btn-secondary" type="button" disabled={Boolean(pendingKey)} onClick={() => void generateAll()}>
            {pendingKey === "all" ? "Generating…" : "Generate missing"}
          </button>
        </div>
      </div>
      <div className="space-y-2 p-3">
        <p className="text-sm text-slate-600">
          Multi-drop loads get a BOL for each delivery, a master BOL with every stop, a blind BOL (cities only —
          no street or consignee), and a BOL with signatures at each stop. Carrier and customer confirmations and
          a draft invoice stay on this list too. Print / view opens the preview here — the load stays open.
        </p>
        <label className="field max-w-sm">
          <span>Filter the document list</span>
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter…" />
        </label>
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="table-grid min-w-[720px] text-sm">
            <thead>
              <tr>
                <th>Document name</th>
                <th>Upload source</th>
                <th>Defaulted</th>
                <th>Upload date</th>
                <th>Description</th>
                <th>Attached to</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const busy = pendingKey === `${row.key}:${row.stopId ?? ""}`;
                return (
                  <tr key={`${row.key}:${row.stopId ?? ""}:${row.filename}`}>
                    <td>
                      <button
                        type="button"
                        className="font-medium text-sky-800 underline"
                        data-defaulted-open=""
                        disabled={busy}
                        onClick={() => void openRow(row)}
                      >
                        {busy ? "Opening…" : row.title}
                      </button>
                    </td>
                    <td className="text-xs text-slate-600">{row.source}</td>
                    <td>
                      <input type="checkbox" checked readOnly aria-label={`Defaulted ${row.title}`} />
                    </td>
                    <td className="whitespace-nowrap text-xs">{row.createdAt ? formatDateTime(row.createdAt) : "—"}</td>
                    <td className="max-w-xs text-xs text-slate-600">{row.description}</td>
                    <td className="whitespace-nowrap">{row.attachedTo || `Load ${loadNumber}`}</td>
                    <td>{row.status === "generated" ? "Generated" : "Ready"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
