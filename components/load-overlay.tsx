import { Suspense } from "react";
import { LoadEditor } from "@/components/load-editor";
import { LoadOverlayFrame } from "@/components/load-overlay-frame";

export function LoadOverlay({
  loadId,
  returnTo,
  initialTab,
}: {
  loadId: number;
  returnTo: string;
  initialTab?: string;
}) {
  return (
    <LoadOverlayFrame loadId={loadId}>
      <div className="load-overlay-backdrop" role="dialog" aria-label="Edit load">
        <div className="load-overlay-panel">
          <Suspense fallback={<p className="px-5 py-6 text-sm text-slate-700">Opening…</p>}>
            <LoadEditor loadId={loadId} returnTo={returnTo} variant="overlay" initialTab={initialTab} />
          </Suspense>
        </div>
      </div>
    </LoadOverlayFrame>
  );
}
