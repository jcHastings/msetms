export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function renderUtf8Csv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [
    headers.map((header) => csvEscape(header)).join(","),
    ...rows.map((row) => row.map((cell) => csvEscape(cell ?? "")).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
