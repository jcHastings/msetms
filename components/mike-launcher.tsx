"use client";

import { useState } from "react";
import { MikeChat } from "@/components/mike-chat";
import type { MikeMessage } from "@/lib/mike-shared";

function MikeSparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mike-sparkle-icon">
      <path
        fill="currentColor"
        d="M8 1.15 8.86 4.1l2.95.86-2.95.86L8 8.77l-.86-2.95-2.95-.86 2.95-.86L8 1.15Zm4.55 5.2.5 1.65 1.65.5-1.65.5-.5 1.65-.5-1.65-1.65-.5 1.65-.5.5-1.65ZM3.35 8.7l.46 1.45 1.45.46-1.45.46-.46 1.45-.46-1.45-1.45-.46 1.45-.46.46-1.45Z"
      />
    </svg>
  );
}

export function MikeLauncher({
  configured,
  initialMessages,
}: {
  configured: boolean;
  initialMessages: MikeMessage[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Ask Mike — dispatcher assistant"
          title="Ask Mike — dispatcher assistant"
          data-mike-launcher=""
        >
          <MikeSparkleIcon />
          Mike
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="presentation">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close dispatcher assistant"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Dispatcher assistant"
            className="relative flex h-full w-full max-w-md flex-col bg-background shadow-2xl"
          >
            <div className="flex justify-end px-4 pt-3">
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 px-4 pb-4">
              <MikeChat configured={configured} initialMessages={initialMessages} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
