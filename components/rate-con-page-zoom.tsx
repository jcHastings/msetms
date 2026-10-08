"use client";

/* Page images are already rasterized; next/image would reprocess them. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

export function RateConPageZoom({ pages }: { pages: Array<{ src: string; label: string }> }) {
  const [scale, setScale] = useState(1);
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-slate-950/95 py-2">
        <button
          type="button"
          className="btn min-h-11 min-w-11 bg-white text-lg text-slate-950"
          onClick={() => setScale((value) => Math.max(1, Math.round((value - 0.25) * 100) / 100))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="btn min-h-11 min-w-11 bg-white text-lg text-slate-950"
          onClick={() => setScale((value) => Math.min(3, Math.round((value + 0.25) * 100) / 100))}
          aria-label="Zoom in"
        >
          +
        </button>
        <p className="text-sm text-slate-300">Pinch to zoom</p>
      </div>
      <div className="space-y-3 overflow-auto" style={{ touchAction: "pinch-zoom" }}>
        {pages.map((page) => (
          <img
            key={page.src}
            src={page.src}
            alt={page.label}
            className="h-auto max-w-none rounded-lg bg-white"
            style={{ width: `${Math.round(scale * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
