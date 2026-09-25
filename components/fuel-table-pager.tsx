import Link from "next/link";

export function FuelTablePager({
  page,
  pageCount,
  total,
  hrefForPage,
  label,
}: {
  page: number;
  pageCount: number;
  total: number;
  hrefForPage: (page: number) => string;
  label: string;
}) {
  if (pageCount <= 1) return null;
  const previous = page > 1;
  const next = page < pageCount;
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3"
      data-fuel-table-pager=""
      aria-label={label}
    >
      {previous ? (
        <Link href={hrefForPage(page - 1)} scroll={false} className="btn btn-secondary">
          Previous
        </Link>
      ) : (
        <span className="btn btn-secondary opacity-45" aria-disabled="true">
          Previous
        </span>
      )}
      <span className="text-xs tabular-nums text-slate-500">
        Page {page} of {pageCount}
        <span className="text-slate-400"> · {total}</span>
      </span>
      {next ? (
        <Link href={hrefForPage(page + 1)} scroll={false} className="btn btn-secondary">
          Next
        </Link>
      ) : (
        <span className="btn btn-secondary opacity-45" aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
