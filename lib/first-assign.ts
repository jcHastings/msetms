/** True when a dropdown/typeahead goes from empty to a real saved value. */
export function isFirstAssign(previous: string | number | null | undefined, next: string): boolean {
  const prev = previous == null || String(previous).trim() === "" ? "" : String(previous);
  return prev === "" && next.trim() !== "";
}

/** True when a persisted dropdown value is being changed (including cleared). */
export function isAssignEdit(previous: string | number | null | undefined, next: string): boolean {
  const prev = previous == null || String(previous).trim() === "" ? "" : String(previous);
  const value = next.trim();
  return prev !== "" && prev !== value;
}
