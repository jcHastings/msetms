"use client";

import { createClaimAction, saveTemplateAction, watchLoadAction } from "@/lib/dispatcher-actions";
import type { LoadView } from "@/lib/types";

type ClaimRow = { id: number; claim_number: string; kind: string; status: string };

export function LoadExtraDetails({
  load,
  claims,
}: {
  load: LoadView;
  claims: ClaimRow[];
}) {
  return (
    <section className="card mt-2 p-3">
      <h2 className="text-sm font-semibold">Claim / OS&D</h2>
      {claims.length ? (
        <ul className="mt-2 text-sm">
          {claims.map((claim) => (
            <li key={claim.id}>
              {claim.claim_number} · {claim.kind} · {claim.status}
            </li>
          ))}
        </ul>
      ) : null}
      <form action={createClaimAction} className="mt-3 grid gap-3 md:grid-cols-3">
        <input type="hidden" name="load_id" value={load.id} />
        <div className="field">
          <label htmlFor="claim_number">Claim #</label>
          <input id="claim_number" name="claim_number" required />
        </div>
        <div className="field">
          <label htmlFor="claim_kind">Kind</label>
          <select id="claim_kind" name="kind" defaultValue="osd">
            <option value="osd">OS&D</option>
            <option value="temp">Temperature</option>
            <option value="cargo">Cargo</option>
          </select>
        </div>
        <div className="field md:col-span-3">
          <label htmlFor="claim_notes">Notes</label>
          <input id="claim_notes" name="notes" />
        </div>
        <button className="btn btn-secondary" type="submit">
          Open claim
        </button>
      </form>
    </section>
  );
}

export function LoadWatchRow({ load }: { load: LoadView }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <form action={saveTemplateAction} className="flex gap-2">
        <input type="hidden" name="load_id" value={load.id} />
        <input
          name="name"
          placeholder="Template name"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button className="btn btn-secondary" type="submit">
          Save template
        </button>
      </form>
      <form action={watchLoadAction}>
        <input type="hidden" name="load_id" value={load.id} />
        <input type="hidden" name="watched" value={load.watched ? "0" : "1"} />
        <button className="btn btn-secondary" type="submit">
          {load.watched ? "Unwatch" : "Watch"}
        </button>
      </form>
    </div>
  );
}
