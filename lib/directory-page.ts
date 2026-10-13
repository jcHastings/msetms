export const DIRECTORY_PAGE_SIZE = 25;

export function parseDirectoryPage(value: unknown): number {
  const page = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function directoryNeedle(q: string): string {
  return String(q ?? "")
    .replace(/[%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function paginateDirectory<T>(
  rows: T[],
  page: number,
  pageSize = DIRECTORY_PAGE_SIZE,
): {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
} {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(pageCount, Math.max(1, page));
  return {
    rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export function directoryHref(path: string, q: string, page: number, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
