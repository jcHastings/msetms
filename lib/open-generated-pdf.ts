/** Client-safe helpers for opening a generated PDF without leaving the current page. */

function popupHost(): Window {
  try {
    if (window.top && window.top !== window) return window.top;
  } catch {
    /* cross-origin embed — stay on this window */
  }
  return window;
}

/** True when `preview` is this page, the overlay iframe, or the board behind it. */
export function isSamePageWindow(preview: Window | null): boolean {
  if (!preview) return true;
  try {
    if (preview.closed) return true;
    if (preview === window) return true;
    if (preview === window.parent) return true;
    if (preview === window.top) return true;
  } catch {
    return false;
  }
  return false;
}

function triggerDownload(href: string, filename: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function openPdfInNewTab(
  href: string,
  event?: { preventDefault(): void; stopPropagation?(): void },
): Promise<void> {
  event?.preventDefault();
  event?.stopPropagation?.();
  const absolute = new URL(href, window.location.origin).href;
  const host = popupHost();
  const preview = host.open("about:blank", "_blank");
  const safe = isSamePageWindow(preview) ? null : preview;
  try {
    const response = await fetch(absolute, { credentials: "same-origin" });
    if (!response.ok) {
      safe?.close();
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(pdfBlob(blob));
    const filename = filenameFromContentDisposition(response.headers.get("content-disposition"), "document.pdf");
    if (safe) {
      try {
        safe.opener = null;
        safe.location.replace(url);
        return;
      } catch {
        safe.close();
      }
    }
    const opened = host.open(url, "_blank");
    if (isSamePageWindow(opened)) {
      triggerDownload(url, filename);
    }
  } catch {
    safe?.close();
  }
}

export function downloadWithoutLeaving(href: string, filename = "document.pdf"): void {
  const absolute = new URL(href, window.location.origin).href;
  triggerDownload(absolute, filename);
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
  const safe = isSamePageWindow(preview) ? null : preview;
  if (safe) {
    try {
      safe.opener = null;
      safe.location.href = openUrl;
    } catch {
      safe.close();
      const opened = popupHost().open(openUrl, "_blank");
      if (isSamePageWindow(opened)) triggerDownload(persisted?.downloadUrl || url, filename);
    }
  } else {
    const opened = popupHost().open(openUrl, "_blank");
    if (isSamePageWindow(opened)) triggerDownload(persisted?.downloadUrl || url, filename);
  }
  const link = document.createElement("a");
  link.href = persisted?.downloadUrl || url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
