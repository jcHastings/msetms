export type DriverDestinationLoad = {
  id: number;
  delivery_end?: string | null;
};

/** Active load first; else the newest delivered/completed. None only when the driver has no loads. */
export function pickDriverDestinationLoad<T extends DriverDestinationLoad>(
  active: T[],
  delivered: T[],
): T | null {
  if (active[0]) return active[0];
  if (delivered.length === 0) return null;
  return [...delivered].sort((left, right) => {
    const leftKey = left.delivery_end ?? "";
    const rightKey = right.delivery_end ?? "";
    return rightKey.localeCompare(leftKey) || right.id - left.id;
  })[0] ?? null;
}
