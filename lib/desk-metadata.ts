export function deskMetadata(title: string, opts?: { absolute?: boolean }) {
  if (opts?.absolute === false) return { title };
  return { title: { absolute: `${title} · MS Express TMS` } };
}
