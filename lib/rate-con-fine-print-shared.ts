/** Rule scan of rate-con text for money terms. Client-safe. Advisory only. */

export type FinePrintKind =
  | "detention"
  | "tonu"
  | "layover"
  | "tracking"
  | "appointment"
  | "lumper"
  | "late_fee"
  | "penalty";

export type FinePrintHit = {
  kind: FinePrintKind;
  label: string;
  snippet: string;
};

const RULES: Array<{ kind: FinePrintKind; label: string; re: RegExp }> = [
  { kind: "detention", label: "Detention", re: /\bdetention\b|\bfree time\b.{0,48}\$/i },
  { kind: "tonu", label: "TONU", re: /\bTONU\b|\btruck ordered not used\b|\btruck ordered not utilized\b/i },
  { kind: "layover", label: "Layover", re: /\blayover\b/i },
  {
    kind: "tracking",
    label: "Tracking penalty",
    re: /\b(macropoint|macro point|four ?kites|late check[- ]?call|failure to (update|check in)|must update tracking|tracking (fine|fee|penalty|required))\b/i,
  },
  {
    kind: "appointment",
    label: "Appointment window",
    re: /\b(appointment window|set appt|missed appointment|late (to|for) (the )?appointment|appointment (fee|penalty|fine)|after[- ]hours (fee|charge))\b/i,
  },
  {
    kind: "lumper",
    label: "Lumper",
    re: /\blumper\b|\bunload(?:ing)? (?:fee|charge)\b|\bunload(?:ing)? at (?:the )?driver'?s? (?:expense|responsibility)\b/i,
  },
  {
    kind: "late_fee",
    label: "Late fee",
    re: /\blate (fee|charge|penalty)\b|\bliquidated damages\b|\bon[- ]time (delivery|pickup) (penalty|fee)\b/i,
  },
  {
    kind: "penalty",
    label: "Money penalty",
    re: /\b(?:fine of|penalty of|chargebacks? (?:for|on) (?:cargo|claim|claims|damage)|cargo (?:claim )?chargebacks?|\$\s?\d[\d,]*(?:\.\d{2})?\s*(?:fine|penalty))\b/i,
  },
];

export function scanRateConFinePrint(text: string): FinePrintHit[] {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const hits: FinePrintHit[] = [];
  for (const rule of RULES) {
    const match = rule.re.exec(raw);
    if (!match || match.index == null) continue;
    hits.push({
      kind: rule.kind,
      label: rule.label,
      snippet: snippetAround(raw, match.index, match[0].length),
    });
  }
  return hits;
}

function snippetAround(text: string, index: number, length: number): string {
  const pad = 70;
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}
