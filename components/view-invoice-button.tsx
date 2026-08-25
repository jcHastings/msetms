"use client";

import { useState } from "react";
import { downloadAndOpenPdf, filenameFromContentDisposition } from "@/lib/open-generated-pdf";

export function ViewInvoiceButton({
  loadId,
  status,
  attachmentId = null,
}: {
  loadId: number;
  status: string;
  attachmentId?: number | null;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const canInvoice = status === "delivered" || status === "completed";

  async function onClick() {
    setError("");
    setPending(true);
    const preview = window.open("about:blank", "_blank");
    try {
      if (attachmentId) {
        const response = await fetch(`/api/attachments/${attachmentId}`);
        if (!response.ok) throw new Error("Invoice file could not be opened.");
        const blob = await response.blob();
        downloadAndOpenPdf(blob, "invoice.pdf", preview, {
          openUrl: `/api/attachments/${attachmentId}`,
          downloadUrl: `/api/attachments/${attachmentId}?download=1`,
        });
        return;
      }
      const response = await fetch(`/api/loads/${loadId}/invoice`, { method: "POST" });
      if (!response.ok) {
        preview?.close();
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Could not create invoice.");
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromContentDisposition(response.headers.get("content-disposition"), "invoice.pdf");
      const createdId = response.headers.get("X-Attachment-Id");
      downloadAndOpenPdf(
        blob,
        filename,
        preview,
        createdId
          ? {
              openUrl: `/api/attachments/${createdId}`,
              downloadUrl: `/api/attachments/${createdId}?download=1`,
            }
          : undefined,
      );
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : "Could not open invoice.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className="btn btn-secondary"
        type="button"
        onClick={onClick}
        disabled={pending || (!attachmentId && !canInvoice)}
      >
        {pending ? "Opening…" : "View Invoice"}
      </button>
      {error ? <span className="text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}
