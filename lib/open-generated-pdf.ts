/** Client-safe helpers for opening a generated PDF in Chrome on Windows. */

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const quoted = header?.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const bare = header?.match(/filename=([^;]+)/i);
  return bare?.[1]?.trim() || fallback;
}

export function downloadAndOpenPdf(blob: Blob, filename: string, preview: Window | null): void {
  const url = URL.createObjectURL(blob);
  if (preview && !preview.closed) {
    preview.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
