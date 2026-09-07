export function deskMetadata(title: string, opts?: { absolute?: boolean }) {
  if (opts?.absolute) return { title: { absolute: `${title} · MS Express TMS` } };
  return { title };
}
