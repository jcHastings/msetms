export default function FuelLoading() {
  return (
    <div className="space-y-4" data-fuel-loading="" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading fuel</p>
      <div className="h-8 w-40 rounded bg-slate-200" />
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <div className="h-8 w-16 rounded bg-slate-200" />
        <div className="h-8 w-24 rounded bg-slate-100" />
        <div className="h-8 w-28 rounded bg-slate-100" />
        <div className="h-8 w-28 rounded bg-slate-100" />
      </div>
      <div className="card h-36" />
      <div className="card h-28" />
    </div>
  );
}
