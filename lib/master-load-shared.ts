/** Client-safe helpers for Ascend-style master loads (MSE-12345-A / B / C). */

export const CHILD_SUFFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type MasterFamilyMember = {
  id: number;
  load_number: string;
  customer_id: number;
  customer_name: string;
  parent_load_id: number | null;
  master_suffix: string;
  rate: number | null;
};

export function childLoadNumber(masterNumber: string, suffix: string): string {
  return `${masterNumber.trim()}-${suffix.trim().toUpperCase()}`;
}

export function nextChildSuffix(used: string[]): string {
  const taken = new Set(used.map((value) => value.trim().toUpperCase()).filter(Boolean));
  const next = CHILD_SUFFIXES.find((letter) => !taken.has(letter));
  if (!next) throw new Error("This master already has A through Z.");
  return next;
}

export function isChildLoad(load: { parent_load_id?: number | null }): boolean {
  return Boolean(load.parent_load_id);
}

export function sortMasterFamilies<
  T extends { id: number; parent_load_id?: number | null; load_number: string },
>(loads: T[]): T[] {
  const childrenByParent = new Map<number, T[]>();
  const roots: T[] = [];
  for (const load of loads) {
    if (load.parent_load_id) {
      const list = childrenByParent.get(load.parent_load_id) ?? [];
      list.push(load);
      childrenByParent.set(load.parent_load_id, list);
    } else {
      roots.push(load);
    }
  }
  const out: T[] = [];
  const seen = new Set<number>();
  for (const root of roots) {
    out.push(root);
    seen.add(root.id);
    const kids = (childrenByParent.get(root.id) ?? []).slice().sort((a, b) => a.load_number.localeCompare(b.load_number));
    for (const kid of kids) {
      out.push(kid);
      seen.add(kid.id);
    }
  }
  for (const load of loads) {
    if (!seen.has(load.id)) out.push(load);
  }
  return out;
}
