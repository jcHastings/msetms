/** True when a dropdown/typeahead goes from empty to a real saved value. */
export function isFirstAssign(previous: string | number | null | undefined, next: string): boolean {
  const prev = previous == null || String(previous).trim() === "" ? "" : String(previous);
  return prev === "" && next.trim() !== "";
}
