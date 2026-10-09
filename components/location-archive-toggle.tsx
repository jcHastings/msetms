"use client";

export function LocationArchiveToggle({
  q,
  includeArchived,
}: {
  q: string;
  includeArchived: boolean;
}) {
  function href(next: boolean): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next) params.set("archived", "1");
    const query = params.toString();
    return query ? `/locations?${query}` : "/locations";
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm" htmlFor="include-archived">
        <input
          id="include-archived"
          type="checkbox"
          role="switch"
          aria-checked={includeArchived}
          checked={includeArchived}
          onChange={() => {
            window.location.href = href(!includeArchived);
          }}
        />
        Include archived
      </label>
    </div>
  );
}
