import { Suspense } from "react";
import { LoadEditor } from "@/components/load-editor";
import { LoadOverlayFrame } from "@/components/load-overlay-frame";
import { LoadOverlayPortal } from "@/components/load-overlay-portal";

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
      <LoadOverlayPortal>
        <div className="load-overlay-backdrop" role="dialog" aria-label="Edit load" data-load-overlay="">
          <div className="load-overlay-panel">
            <Suspense fallback={<p className="px-5 py-6 text-sm text-slate-700">Opening…</p>}>
              <LoadEditor loadId={loadId} returnTo={returnTo} variant="overlay" initialTab={initialTab} />
            </Suspense>
          </div>
        </div>
      </LoadOverlayPortal>
    </LoadOverlayFrame>
  );
}
