"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTrailerShareLinkAction } from "@/lib/actions";
import { FormBanner } from "@/components/form-banner";
import { useDismissable } from "@/components/use-dismissable";
import { formatCompactShareExpiry, formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/types";

function compactShareState(sharePath: string, expiresAt: string, now = Date.now()): "none" | "live" | "expired" {
  if (!sharePath) return "none";
  const expires = Date.parse(expiresAt);
  if (Number.isFinite(expires) && expires > now) return "live";
  return "expired";
}

function absoluteShareUrl(sharePath: string): string {
  if (typeof window === "undefined") return sharePath;
  return `${window.location.origin}${sharePath}`;
}

export function TrailerShareLinkPanel({
  trailerId,
  sharePath,
  expiresAt,
  compact = false,
}: {
  trailerId: number;
  sharePath: string;
  expiresAt: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await createTrailerShareLinkAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  useDismissable(viewOpen, () => setViewOpen(false), viewRef);

  async function copy() {
    if (!sharePath) return;
    const url = absoluteShareUrl(sharePath);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (compact) {
    const linkState = compactShareState(sharePath, expiresAt);
    const expiryLabel = expiresAt ? formatCompactShareExpiry(expiresAt) : "—";
    const compactForm = (
      <form action={formAction} className="trailer-share-compact-form" data-trailer-share-form="">
        <input type="hidden" name="trailer_id" value={trailerId} />
        <input
          id={`trailer-share-expires-${trailerId}`}
          name="expires_at"
          type="datetime-local"
          required
          aria-label="Expires"
          data-trailer-share-expires-input=""
        />
        <button
          className={linkState === "live" ? "btn btn-secondary" : "btn btn-primary"}
          type="submit"
          disabled={pending}
          data-trailer-share-create=""
        >
          {pending ? "Creating…" : linkState === "expired" ? "New link" : linkState === "live" ? "New" : "Create link"}
        </button>
      </form>
    );
    return (
      <div className="trailer-share-compact" data-trailer-share="" data-trailer-share-state={linkState}>
        <FormBanner result={state} hideOk />
        <div className="trailer-share-compact-row">
          {linkState === "live" ? (
            <>
              <span className="trailer-share-compact-chip trailer-share-compact-chip-live" data-trailer-share-expires="">
                Active · Exp {expiryLabel}
              </span>
              <div className="trailer-share-compact-reveal" ref={viewRef}>
                <button
                  className="trailer-share-compact-view"
                  type="button"
                  data-trailer-share-view=""
                  aria-expanded={viewOpen}
                  onClick={() => setViewOpen((open) => !open)}
                >
                  View
                </button>
                {viewOpen ? (
                  <div className="trailer-share-compact-popover" data-trailer-share-popover="" role="dialog">
                    <span className="trailer-share-compact-popover-url" data-trailer-share-url="">
                      {absoluteShareUrl(sharePath)}
                    </span>
                    <button className="btn btn-secondary" type="button" data-trailer-share-copy="" onClick={() => void copy()}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : null}
              </div>
              <button className="btn btn-secondary" type="button" data-trailer-share-copy="" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy"}
              </button>
              {compactForm}
            </>
          ) : null}
          {linkState === "expired" ? (
            <>
              <span className="trailer-share-compact-chip trailer-share-compact-chip-expired" data-trailer-share-expires="">
                Expired {expiryLabel}
              </span>
              {compactForm}
            </>
          ) : null}
          {linkState === "none" ? compactForm : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4" data-trailer-share="">
      <h2 className="text-sm font-semibold">Customer link</h2>
      <FormBanner result={state} />
      {sharePath ? (
        <div className="space-y-1 text-sm">
          <div className="break-all font-mono text-xs" data-trailer-share-url="">
            {sharePath}
          </div>
          {expiresAt ? (
            <div className="text-xs text-slate-600" data-trailer-share-expires="">
              Expires {formatDateTime(expiresAt)}
            </div>
          ) : null}
          <button className="btn btn-secondary" type="button" data-trailer-share-copy="" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}
      <form action={formAction} className="space-y-2" data-trailer-share-form="">
        <input type="hidden" name="trailer_id" value={trailerId} />
        <div className="field">
          <label htmlFor={`trailer-share-expires-${trailerId}`}>Expires</label>
          <input
            id={`trailer-share-expires-${trailerId}`}
            name="expires_at"
            type="datetime-local"
            required
            data-trailer-share-expires-input=""
          />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={pending} data-trailer-share-create="">
          {pending ? "Creating…" : sharePath ? "New link" : "Create customer link"}
        </button>
      </form>
    </div>
  );
}
