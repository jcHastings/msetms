export function LoadOverlayFallback({ label = "Opening load" }: { label?: string }) {
  return (
    <div className="load-overlay-backdrop" role="status" aria-live="polite" aria-label={label}>
      <div className="load-overlay-panel px-5 py-6 text-sm text-slate-700">Opening…</div>
    </div>
  );
}
