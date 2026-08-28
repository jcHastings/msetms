export function pdfResponseHeaders(filename: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Encoding": "identity",
    ...extra,
  };
}
