/**
 * Pure text helpers for Driver Assist intent routing. No LLM, no network.
 * Everything here is deterministic so tests can pin each phrase.
 */

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

/** Optimal string alignment distance (Levenshtein plus adjacent transposition). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) d[i][0] = i;
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Allowed typo budget by word length: short words must match exactly. */
export function typoBudget(word: string): number {
  if (word.length >= 8) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

export function fuzzyWordMatch(token: string, target: string): boolean {
  if (token === target) return true;
  const budget = Math.min(typoBudget(token), typoBudget(target));
  if (!budget) return false;
  if (Math.abs(token.length - target.length) > budget) return false;
  return editDistance(token, target) <= budget;
}

function hasFuzzy(tokens: string[], targets: string[]): boolean {
  return tokens.some((token) => targets.some((target) => fuzzyWordMatch(token, target)));
}

function hasPhrase(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

export type AssistDocKind =
  | "registration"
  | "dot_inspection"
  | "insurance"
  | "cdl"
  | "med_card"
  | "other"
  | "ifta_license";

/** IFTA, typos included (IFTF, IFAT, IFTS), and "fuel tax license/permit". */
export function mentionsIfta(question: string): boolean {
  const text = normalizeText(question);
  if (hasPhrase(text, /\bfuel\s*tax\b/)) return true;
  return tokenize(question).some((token) => {
    if (token === "ifta" || token === "iftas") return true;
    if (token.length < 3 || token.length > 5 || token[0] !== "i") return false;
    return editDistance(token, "ifta") <= 1;
  });
}

export function mentionsRegistration(question: string): boolean {
  const text = normalizeText(question);
  const tokens = tokenize(question);
  if (tokens.some((token) => token === "reg" || token === "regs" || token === "rego" || token === "irp")) return true;
  if (hasPhrase(text, /\bcab\s*cards?\b/) || hasPhrase(text, /\bapportioned\b/)) return true;
  if (tokens.some((token) => token.startsWith("regist") || token.startsWith("registr"))) return true;
  return hasFuzzy(tokens, ["registration", "registrations"]);
}

export function mentionsCabCard(question: string): boolean {
  const text = normalizeText(question);
  return /\bcab\s*cards?\b/.test(text) || /\birp\b/.test(text) || /\bapportioned\b/.test(text);
}

export function mentionsInsurance(question: string): boolean {
  const text = normalizeText(question);
  const tokens = tokenize(question);
  if (tokens.includes("coi") || tokens.includes("cois")) return true;
  if (/\bproof\s+of\s+ins/.test(text)) return true;
  if (/\bins\s+cards?\b/.test(text)) return true;
  return hasFuzzy(tokens, ["insurance", "insured"]);
}

export function mentionsDot(question: string): boolean {
  const tokens = tokenize(question);
  return tokens.includes("dot") || hasFuzzy(tokens, ["inspection", "inspections"]);
}

export function mentionsMedCard(question: string): boolean {
  const text = normalizeText(question);
  return /\bmed(?:ical)?\s*cards?\b/.test(text) || /\bdot\s+physical\b/.test(text) || /\bmedical\s+cert/.test(text);
}

export function mentionsCdl(question: string): boolean {
  const tokens = tokenize(question);
  if (tokens.includes("cdl") || tokens.includes("cdls")) return true;
  // "IFTA license" / "fuel tax license" is a company doc, not the driver's license.
  if (mentionsIfta(question)) return false;
  return hasFuzzy(tokens, ["license", "licence"]) || /\bdrivers?\s+licen/.test(normalizeText(question));
}

export function mentionsOtherDoc(question: string): boolean {
  return /\bother\b/.test(normalizeText(question));
}

export function namedAssistDocKinds(question: string): AssistDocKind[] {
  const kinds: AssistDocKind[] = [];
  if (mentionsRegistration(question)) kinds.push("registration");
  if (mentionsDot(question) && !mentionsMedCard(question)) kinds.push("dot_inspection");
  if (mentionsInsurance(question)) kinds.push("insurance");
  if (mentionsCdl(question)) kinds.push("cdl");
  if (mentionsMedCard(question)) kinds.push("med_card");
  if (mentionsIfta(question)) kinds.push("ifta_license");
  if (mentionsOtherDoc(question) && /\bdoc|\bfile|\bpaper/.test(normalizeText(question))) kinds.push("other");
  return kinds;
}

export function mentionsDocsGeneric(question: string): boolean {
  return /\b(docs?|documents?|paperwork|papers|binder)\b/.test(normalizeText(question));
}

export function mentionsTrailer(question: string): boolean {
  const tokens = tokenize(question);
  return tokens.some((token) => ["trailer", "trailers", "trl", "trlr", "reefer"].includes(token) || fuzzyWordMatch(token, "trailer"));
}

export function mentionsTruck(question: string): boolean {
  const text = normalizeText(question);
  const tokens = tokenize(question);
  if (/\bpower\s+unit\b/.test(text)) return true;
  return tokens.some((token) => ["truck", "trucks", "tractor", "trk"].includes(token) || fuzzyWordMatch(token, "tractor"));
}

/** Unit-number candidates: "5312", "#5312", "T5312", "MS2205", "trailer 22-05". */
export function unitCandidates(question: string): string[] {
  const raw = question.toLowerCase().replace(/(\d)-(\d)/g, "$1$2");
  const out: string[] = [];
  for (const match of raw.matchAll(/#?\s*([a-z]{0,4}\d{1,6}[a-z]?)\b/g)) {
    const value = match[1].replace(/[^a-z0-9]/g, "");
    if (value && /\d/.test(value)) out.push(value);
  }
  return [...new Set(out)];
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/** Unit numbers match on the full normalized value, or on the digits ("5312" ≈ "T5312" ≈ "MS5312"). */
export function unitMatches(candidate: string, unitNumber: string): boolean {
  const unit = unitNumber.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!unit) return false;
  if (candidate === unit) return true;
  const a = digitsOf(candidate);
  const b = digitsOf(unit);
  return Boolean(a) && a === b;
}
