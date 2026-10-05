import Link from "next/link";
import { directoryHref } from "@/lib/directory-page";

export function DirectorySearch({
  action,
  q,
  label,
  placeholder,
  extra,
}: {
  action: string;
  q: string;
  label: string;
  placeholder: string;
  extra?: Record<string, string>;
}) {
  return (
    <form className="load-list-search px-4 pt-3" method="get" action={action} data-directory-search="">
      {extra
        ? Object.entries(extra).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null,
          )
        : null}
      <div className="field min-w-56 flex-1">
        <label htmlFor={`${action.replace(/\W+/g, "-")}-q`}>{label}</label>
        <input id={`${action.replace(/\W+/g, "-")}-q`} name="q" defaultValue={q} placeholder={placeholder} />
      </div>
      <button className="btn btn-secondary" type="submit">
        Search
      </button>
      {q ? (
        <Link href={directoryHref(action, "", 1, extra)} className="btn btn-ghost">
          Clear
        </Link>
      ) : null}
    </form>
  );
}

export function DirectoryPager({
  path,
  q,
  page,
  pageCount,
  extra,
}: {
  path: string;
  q: string;
  page: number;
  pageCount: number;
  extra?: Record<string, string>;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3"
      data-directory-pagination=""
      aria-label="Directory pages"
    >
      {page > 1 ? (
        <Link href={directoryHref(path, q, page - 1, extra)} className="btn btn-secondary">
          Previous
        </Link>
      ) : (
        <span className="btn btn-secondary pointer-events-none opacity-45">Previous</span>
      )}
      <span className="text-xs text-slate-500">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={directoryHref(path, q, page + 1, extra)} className="btn btn-secondary">
          Next
        </Link>
      ) : (
        <span className="btn btn-secondary pointer-events-none opacity-45">Next</span>
      )}
    </nav>
  );
}
