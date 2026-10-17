/** Pull detention rate, free time, cap, and rounding from one rate confirmation. */

import { scanRateConFinePrint } from "./rate-con-fine-print-shared";

export type DetentionTerms = {
  found: boolean;
  rate: number | null;
  freeMinutes: number | null;
  cap: number | null;
  roundMinutes: number | null;
  clause: string;
};

const DETENTION_HIT = /\bdetention\b|\bfree time\b.{0,80}\$/i;

export function parseDetentionTerms(text: string): DetentionTerms {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  const empty: DetentionTerms = {
    found: false,
    rate: null,
    freeMinutes: null,
    cap: null,
    roundMinutes: null,
    clause: "",
  };
  if (!raw) return empty;
  const scanned = scanRateConFinePrint(raw).some((hit) => hit.kind === "detention");
  const match = DETENTION_HIT.exec(raw);
  if (!scanned && !match) return empty;
  const index = match?.index ?? 0;
  const length = match?.[0].length ?? 0;
  const window = raw.slice(Math.max(0, index - 180), Math.min(raw.length, index + length + 320)).trim();
  const clause = window.length > 500 ? `${window.slice(0, 497)}...` : window;
  return {
    found: true,
    rate: parseRate(window),
    freeMinutes: parseFreeMinutes(window),
    cap: parseCap(window),
    roundMinutes: parseRoundMinutes(window),
    clause,
  };
}

function parseRate(window: string): number | null {
  const patterns = [
    /\$\s*(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:\/\s*(?:hr|hour)|per\s+(?:hr|hour)|an\s+hour)\b/i,
    /\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollars?\s+)?per\s+(?:hr|hour)\b/i,
  ];
  for (const pattern of patterns) {
    const hit = pattern.exec(window);
    if (!hit) continue;
    const amount = Number(hit[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0 && amount < 10000) return roundMoney(amount);
  }
  return null;
}

function parseFreeMinutes(window: string): number | null {
  const hours =
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s+)?free(?:\s+time)?\b/i.exec(window) ||
    /\bfree(?:\s+time)?(?:\s+of)?\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i.exec(window) ||
    /\bafter\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i.exec(window);
  if (hours) {
    const value = Number(hours[1]);
    if (value > 0 && value <= 72) return Math.round(value * 60);
  }
  const minutes =
    /(\d+)\s*(?:minutes?|mins?)\s*(?:of\s+)?free(?:\s+time)?\b/i.exec(window) ||
    /\bfree(?:\s+time)?(?:\s+of)?\s+(\d+)\s*(?:minutes?|mins?)\b/i.exec(window) ||
    /\bafter\s+(\d+)\s*(?:minutes?|mins?)\b/i.exec(window);
  if (minutes) {
    const value = Number(minutes[1]);
    if (value > 0 && value <= 72 * 60) return value;
  }
  return null;
}

function parseCap(window: string): number | null {
  const hit =
    /(?:not to exceed|maximum of|maximum|max(?:imum)?|cap(?:ped)?(?:\s+at)?(?:\s+of)?)\s+\$\s*(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)/i.exec(
      window,
    );
  if (!hit) return null;
  const amount = Number(hit[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return roundMoney(amount);
}

function parseRoundMinutes(window: string): number | null {
  if (/quarter[- ]hours?\b/i.test(window)) return 15;
  if (/(?:full|whole)\s+hours?\b|hourly increments\b|per full hour\b/i.test(window)) return 60;
  const hit = /(\d+)\s*-?\s*(?:minute|min)\s+increments?\b/i.exec(window);
  if (!hit) return null;
  const minutes = Number(hit[1]);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240) return null;
  return minutes;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
