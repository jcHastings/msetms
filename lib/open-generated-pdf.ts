/** Client-safe helpers for opening a generated PDF in Chrome on Windows. */

export function openPdfInNewTab(href: string, event?: { preventDefault(): void }): void {
  event?.preventDefault();
  window.open(href, "_blank", "noopener,noreferrer");
}

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const quoted = header?.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const bare = header?.match(/filename=([^;]+)/i);
  return bare?.[1]?.trim() || fallback;
}

export function pdfBlob(blob: Blob): Blob {
  return blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
}

export function downloadAndOpenPdf(
  blob: Blob,
  filename: string,
  preview: Window | null,
  persisted?: { openUrl: string; downloadUrl: string },
): void {
  const url = URL.createObjectURL(pdfBlob(blob));
  const openUrl = persisted?.openUrl || url;
  if (preview && !preview.closed) {
    preview.location.href = openUrl;
  } else {
    window.open(openUrl, "_blank", "noopener,noreferrer");
  }
  const link = document.createElement("a");
  link.href = persisted?.downloadUrl || url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
