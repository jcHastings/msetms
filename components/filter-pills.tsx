"use client";

export type FilterPillOption = { value: string; label: string };

export function FilterPills({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
}: {
  label: string;
  value: string;
  options: FilterPillOption[];
  onChange: (value: string) => void;
  allLabel?: string;
}) {
  const items = [{ value: "", label: allLabel }, ...options];
  return (
    <div className="filter-pill-group" data-filter-pills={label}>
      <span className="filter-pill-label">{label}</span>
      <div className="filter-pill-row">
        {items.map((item) => (
          <button
            key={`${label}-${item.value || "all"}`}
            type="button"
            className={`filter-pill ${value === item.value ? "filter-pill-active" : ""}`}
            aria-pressed={value === item.value}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
