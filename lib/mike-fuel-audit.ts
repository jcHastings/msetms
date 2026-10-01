import { DISPLAY_TIME_ZONE, formatMdYDisplay, ymdInTimeZone } from "./format";
import {
  resolveFuelAuditWindow,
  scoreFuelAudit,
  summarizeFuelAudit,
  type FuelAuditFlag,
  type FuelAuditReport,
  type FuelAuditRow,
  type FuelAuditWindowKind,
} from "./fuel-audit";
import { listFuelTransactions } from "./fuel-store";

export type MikeFuelAuditQuestion = {
  kind: "fuel_audit";
  windowKind: FuelAuditWindowKind;
};

export function parseMikeFuelAuditQuestion(question: string): MikeFuelAuditQuestion | null {
  const text = question.trim().replace(/[\u2018\u2019]/g, "'");
  if (!text) return null;
  const fuel = /\bfuel(?:ing|s)?\b/i.test(text);
  const audit = /\baudit\b/i.test(text);
  const weird = /\b(weird|abnormal|odd|suspect|suspicious|outlier)\b/i.test(text);
  const tooMuch = /\btoo much\b|\bover(?:using|use)\b|\bhigh (?:fuel|gallons|spend)\b/i.test(text);
  const tooOften = /\btoo often\b|\bfill(?:s|ing)? (?:a lot|too much|too often)\b|\bshort gaps?\b/i.test(text);
  const who = /\bwho(?:'s| is|s)\b.{0,40}\bfuel/i.test(text) || /\bfuel(?:ing)?\b.{0,24}\bwho\b/i.test(text);
  const flags = /\bflag(?:s|ged)?\b.{0,20}\bfuel/i.test(text) || /\bfuel\b.{0,20}\bflag/i.test(text);
  const hit = (audit && (fuel || /\bdef\b/i.test(text))) || (fuel && (weird || tooMuch || tooOften || who || flags));
  if (!hit) return null;
  let windowKind: FuelAuditWindowKind = "week";
  if (/\b(last|past|prior)\s*30\b|\b30\s*days?\b/i.test(text)) windowKind = "last_30";
  else if (/\b(last|past|prior)\s*14\b|\b14\s*days?\b/i.test(text)) windowKind = "last_14";
  else if (/\b(last|past|prior)\s*7\b|\b7\s*days?\b/i.test(text)) windowKind = "last_7";
  return { kind: "fuel_audit", windowKind };
}

function txBits(flag: FuelAuditFlag): string {
  return flag.txs
    .slice(0, 4)
    .map((tx) => {
      const day = Number.isFinite(Date.parse(tx.occurred_at))
        ? formatMdYDisplay(ymdInTimeZone(new Date(tx.occurred_at), DISPLAY_TIME_ZONE))
        : tx.occurred_at.slice(0, 10);
      const gal = tx.gallons == null ? "" : ` ${Math.round(tx.gallons * 10) / 10}g`;
      return `#${tx.id} ${day}${gal}`;
    })
    .join(", ");
}

function flagLine(flag: FuelAuditFlag, index: number): string {
  const unit = flag.unit.trim() ? ` · unit ${flag.unit.trim()}` : "";
  const txs = txBits(flag);
  return `${index + 1}. ${flag.driverName}${unit} · ${flag.kind.replace("_", " ")} · ${flag.product} · ${flag.metric}. Why: ${flag.why}. Txs ${txs || "n/a"}.`;
}

export function formatMikeFuelAuditReply(report: FuelAuditReport): string {
  const soft = "Soft flags only. Nothing sent to drivers.";
  if (!report.txCount) {
    return `No fuel transactions ${report.window.label}. ${soft}`;
  }
  if (!report.flags.length) {
    return `No abnormal fueling ${report.window.label}. ${report.scoredCount} scored txs (diesel/DEF/reefer). ${soft}`;
  }
  const lines = [
    `Fuel audit ${report.window.label}. ${report.flags.length} flag${report.flags.length === 1 ? "" : "s"}. ${soft}`,
    "",
    ...report.flags.map((flag, index) => flagLine(flag, index)),
  ];
  return lines.join("\n");
}

export function answerMikeFuelAuditQuestion(
  question: string,
  now = new Date(),
  rows?: FuelAuditRow[],
): string | null {
  const parsed = parseMikeFuelAuditQuestion(question);
  if (!parsed) return null;
  const window = resolveFuelAuditWindow(parsed.windowKind, now);
  const report = scoreFuelAudit(rows ?? listFuelTransactions(), window);
  return formatMikeFuelAuditReply(report);
}

export function buildMikeFuelAuditSnapshot(now = new Date()) {
  const window = resolveFuelAuditWindow("week", now);
  return summarizeFuelAudit(scoreFuelAudit(listFuelTransactions(), window));
}
