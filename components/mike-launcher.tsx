"use client";

import { useState } from "react";
import { MikeChat } from "@/components/mike-chat";
import type { MikeMessage } from "@/lib/mike-shared";

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
          className="btn btn-primary"
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          Mike
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="presentation">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close Mike"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Mike"
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
