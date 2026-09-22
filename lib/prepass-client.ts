import { getPrepassApiKey } from "./env";
import { classifyTollCategory, type TollCategory, type TollImportResult } from "./tolls";

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

export async function pullPrepassTransactions(): Promise<
  { ok: true; rows: PrepassApiRow[]; message: string } | TollImportResult
> {
  const key = getPrepassApiKey();
  if (!key) {
    return {
      ok: true,
      rows: [],
      message: "PREPASS_API_KEY is missing. API pull skipped; manual CSV/XLSX import still works.",
    };
  }
  // Phase 1 keeps API pull as a thin stub until public endpoint payloads are validated.
  // Returning an empty set avoids fake traffic while still surfacing operator guidance.
  return {
    ok: true,
    rows: [],
    message:
      "PREPASS_API_KEY is set, but PrePass public API payload mapping is not finalized yet. API pull is a no-op in this phase; use manual CSV/XLSX import.",
  };
}

export function normalizePrepassCategory(raw: string): TollCategory {
  return classifyTollCategory(raw);
}
