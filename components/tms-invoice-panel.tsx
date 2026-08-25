"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { downloadAndOpenPdf, filenameFromContentDisposition } from "@/lib/open-generated-pdf";
import type { TmsInvoiceModel } from "@/lib/invoice";
import { labelForUploader, type Attachment } from "@/lib/types";

export function TmsInvoicePanel({
  loadId,
  status,
  invoice,
  saved = false,
  invoices = [],
}: {
  loadId: number;
  status: string;
  invoice: TmsInvoiceModel | null;
  saved?: boolean;
  invoices?: Attachment[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const canInvoice = status === "delivered" || status === "completed";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const preview = window.open("about:blank", "_blank");
    try {
      const response = await fetch(`/api/loads/${loadId}/invoice`, { method: "POST" });
      if (!response.ok) {
        preview?.close();
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Could not create invoice.");
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromContentDisposition(
        response.headers.get("content-disposition"),
        "invoice.pdf",
      );
      const attachmentId = response.headers.get("X-Attachment-Id");
      downloadAndOpenPdf(
        blob,
        filename,
        preview,
        attachmentId
          ? {
              openUrl: `/api/attachments/${attachmentId}`,
              downloadUrl: `/api/attachments/${attachmentId}?download=1`,
            }
          : undefined,
      );
      router.refresh();
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : "Could not create invoice.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card mb-4 p-5" data-invoice-panel="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Invoice</h2>
          <p className="mt-1 text-sm text-slate-600">
            Customer Income / Budget lines only. Driver pay, owner-operator pay, lumper expenses, and
            relays stay off this invoice. QuickBooks connect is not required.
          </p>
        </div>
      </div>
      {invoice ? (
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Invoice #</dt>
            <dd className="font-semibold">{invoice.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Customer</dt>
            <dd className="font-semibold">{invoice.customerName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Load</dt>
            <dd className="font-semibold">{invoice.loadNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Total</dt>
            <dd className="font-semibold">{formatMoney(invoice.total)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          {canInvoice ? "No TMS invoice yet." : "Mark the load Delivered before invoicing."}
        </p>
      )}
      {invoice ? (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {invoice.lines.map((line) => (
            <li key={`${line.name}-${line.description}`} className="flex justify-between gap-3">
              <span>
                {line.name}
                {line.description ? <span className="text-slate-500"> · {line.description}</span> : null}
              </span>
              <span className="font-semibold">{formatMoney(line.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-4">
        <button className="btn btn-primary" type="submit" disabled={pending || !canInvoice}>
          {pending ? "Creating…" : saved ? "Rebuild invoice" : "Create invoice"}
        </button>
      </form>
      {invoices.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {invoices.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <a href={`/api/attachments/${file.id}`} className="font-medium hover:underline">
                  {file.original_name}
                </a>
                <div className="text-xs text-slate-500">
                  Invoice · {labelForUploader(file.uploaded_by)} · {formatDateTime(file.created_at)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn btn-secondary" href={`/api/attachments/${file.id}`}>
                  Open
                </a>
                <a className="btn btn-ghost" href={`/api/attachments/${file.id}?download=1`}>
                  Download
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
