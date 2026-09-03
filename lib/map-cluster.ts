/** Client-safe map pin clustering. No env, db, or API keys. */

import type { LoadMapPoint } from "./load-map-shared";

export const CLUSTER_PIN_SIZE = 28;

export type ClusteredMapItem =
  | { type: "point"; point: LoadMapPoint }
  | { type: "cluster"; id: string; lat: number; lng: number; count: number; points: LoadMapPoint[] };

export const MAP_CLUSTER_MAX_ZOOM = 12;

export function clusterCellDegrees(zoom: number): number {
  const z = Math.max(1, Math.min(20, Number.isFinite(zoom) ? zoom : 5));
  return 90 / 2 ** z;
}

export function shouldClusterMapPoints(pointCount: number, cluster?: boolean): boolean {
  if (cluster === false) return false;
  if (cluster === true) return true;
  return pointCount >= 8;
}

export function clusterLoadMapPoints(points: LoadMapPoint[], zoom: number): ClusteredMapItem[] {
  if (points.length <= 1 || zoom >= MAP_CLUSTER_MAX_ZOOM) {
    return points.map((point) => ({ type: "point" as const, point }));
  }
  const cell = clusterCellDegrees(zoom);
  const groups = new Map<string, LoadMapPoint[]>();
  for (const point of points) {
    const key = `${Math.round(point.lat / cell)},${Math.round(point.lng / cell)}`;
    const list = groups.get(key) ?? [];
    list.push(point);
    groups.set(key, list);
  }
  const items: ClusteredMapItem[] = [];
  for (const [key, list] of groups) {
    if (list.length === 1) {
      items.push({ type: "point", point: list[0] });
      continue;
    }
    const lat = list.reduce((sum, point) => sum + point.lat, 0) / list.length;
    const lng = list.reduce((sum, point) => sum + point.lng, 0) / list.length;
    items.push({ type: "cluster", id: `cluster-${key}`, lat, lng, count: list.length, points: list });
  }
  return items;
}

export function clusterPinSvg(count: number): string {
  const label = count > 99 ? "99+" : String(count);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CLUSTER_PIN_SIZE}" height="${CLUSTER_PIN_SIZE}" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="#07325a" stroke="#137cdd" stroke-width="2"/><text x="14" y="18" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="700" font-family="system-ui,sans-serif">${label}</text></svg>`;
}

export function clusterPinIconUrl(count: number): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(clusterPinSvg(count))}`;
}
