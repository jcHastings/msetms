"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createTrailerShareLinkAction } from "@/lib/actions";
import { FormBanner } from "@/components/form-banner";
import { compactTrailerShareState, formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/types";

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
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await createTrailerShareLinkAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

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
    const linkState = compactTrailerShareState(sharePath, expiresAt);
    const isLive = linkState === "live";
    return (
      <div className="trailer-share-compact" data-trailer-share="" data-trailer-share-state={isLive ? "live" : "none"}>
        <FormBanner result={state} hideOk />
        <div className="trailer-share-compact-row">
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
            <button className="btn btn-primary" type="submit" disabled={pending} data-trailer-share-create="">
              {pending ? "Creating…" : "Create link"}
            </button>
          </form>
          {isLive ? (
            <button className="btn btn-secondary" type="button" data-trailer-share-copy="" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy link"}
            </button>
          ) : null}
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
