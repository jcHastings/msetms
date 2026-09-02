"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createLoadShareLinkAction } from "@/lib/actions";
import { FormBanner } from "@/components/form-banner";
import { formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/types";

export function LoadShareLinkPanel({
  loadId,
  sharePath,
  expiresAt,
}: {
  loadId: number;
  sharePath: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await createLoadShareLinkAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  async function copy() {
    if (!sharePath) return;
    const url = `${window.location.origin}${sharePath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card space-y-3 p-4" data-load-share="">
      <h2 className="text-sm font-semibold">Customer status link</h2>
      <p className="text-xs text-slate-600">You copy and send this. It is not emailed.</p>
      <FormBanner result={state} />
      {sharePath ? (
        <div className="space-y-1 text-sm">
          <div className="break-all font-mono text-xs" data-load-share-url="">
            {sharePath}
          </div>
          {expiresAt ? (
            <div className="text-xs text-slate-600">Expires {formatDateTime(expiresAt)}</div>
          ) : null}
          <button className="btn btn-secondary" type="button" data-load-share-copy="" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}
      <form action={formAction} className="space-y-2" data-load-share-form="">
        <input type="hidden" name="load_id" value={loadId} />
        <div className="field">
          <label htmlFor={`load-share-expires-${loadId}`}>Expires</label>
          <input
            id={`load-share-expires-${loadId}`}
            name="expires_at"
            type="datetime-local"
            required
            data-load-share-expires-input=""
          />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={pending} data-load-share-create="">
          {pending ? "Creating…" : sharePath ? "New link" : "Create status link"}
        </button>
      </form>
    </div>
  );
}
