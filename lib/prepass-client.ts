import { getPrepassApiKey, isPrepassOAuthReady } from "./env";
import { classifyTollCategory, type TollCategory } from "./tolls";

export type PrepassApiRow = {
  date: string;
  time?: string;
  transponder_id: string;
  unit_number?: string;
  driver_name?: string;
  plaza?: string;
  state?: string;
  amount: number;
  category: TollCategory;
  invoice_number?: string;
  reference_number?: string;
};

export type PrepassPullSuccess = {
  ok: true;
  rows: PrepassApiRow[];
  message: string;
};

export type PrepassPullFailure = {
  ok: false;
  message: string;
  error?: string;
};

export type PrepassPullResult = PrepassPullSuccess | PrepassPullFailure;

export async function pullPrepassTransactions(): Promise<PrepassPullResult> {
  const oauthReady = isPrepassOAuthReady();
  const legacyKey = getPrepassApiKey();
  if (!oauthReady && !legacyKey) {
    return {
      ok: true,
      rows: [],
      message:
        "PREPASS_CLIENT_ID and PREPASS_CLIENT_SECRET are missing. API pull skipped; manual CSV/XLSX import still works.",
    };
  }
  // Thin stub only — do not invent an OAuth token exchange against an unknown PrePass contract.
  // Returning an empty set avoids fake traffic while still surfacing operator guidance.
  return {
    ok: true,
    rows: [],
    message: oauthReady
      ? "PrePass OAuth client credentials are present, but PrePass public API payload mapping is not finalized yet. API pull is a no-op in this phase; use manual CSV/XLSX import."
      : "Legacy PREPASS_API_KEY is present, but PrePass public API payload mapping is not finalized yet. API pull is a no-op in this phase; use manual CSV/XLSX import.",
  };
}

export function normalizePrepassCategory(raw: string): TollCategory {
  return classifyTollCategory(raw);
}
