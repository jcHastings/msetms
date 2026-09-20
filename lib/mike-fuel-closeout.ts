import { formatFuelMoney, formatGallons, formatMdYDisplay } from "./format";
import type { FuelCloseoutReport } from "./fuel-closeout";
import { closedFuelWeekStart } from "./miles-source";
import { parseFuelWeekStart } from "./fuel";

export type MikeFuelCloseoutQuestion = {
  kind: "fuel_closeout";
  week: "closed" | "current" | "week";
  weekStartYmd?: string;
};

export function parseMikeFuelCloseoutQuestion(question: string): MikeFuelCloseoutQuestion | null {
  const text = question.trim().replace(/[\u2018\u2019]/g, "'");
  if (!text) return null;
  const fuel = /\bfuel\b/i.test(text);
  const closeout = /\bclose[- ]?out\b/i.test(text);
  const weekly = /\bweekly\b/i.test(text);
  const eow = /\bend[- ]of[- ]week\b|\beow\b/i.test(text);
  const hit =
    (closeout && (fuel || weekly)) ||
    (eow && fuel) ||
    (weekly && fuel && /\b(report|mpg|week)\b/i.test(text));
  if (!hit) return null;
  if (/\baudit\b/i.test(text) && !closeout && !weekly) return null;
  if (/\b(this week|current week|in progress)\b/i.test(text)) return { kind: "fuel_closeout", week: "current" };
  const dated = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (dated?.[1]) return { kind: "fuel_closeout", week: "week", weekStartYmd: dated[1] };
  return { kind: "fuel_closeout", week: "closed" };
}

function n(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatMikeFuelCloseoutReply(report: FuelCloseoutReport): string {
  const spend = report.fleet.spend;
  const lines = [
    `Weekly fuel closeout ${report.week.label}. ${report.note}`,
    `Miles: Samsara odometer (${report.milesSource.status}). ${report.milesSource.note}`,
    `Fleet ${n(report.fleet.miles, 0)} mi · ${formatGallons(report.fleet.dieselGallons)} · ${formatFuelMoney(report.fleet.dieselAmount)} · ${n(report.fleet.mpg)} MPG` +
      (report.fleet.mpgVsPrior == null ? "" : ` · vs prior week ${n(report.fleet.mpgVsPrior)}`),
    `Spend Fuel ${formatFuelMoney(spend.fuel)} · Reefer ${formatFuelMoney(spend.reefer)} · Scale ${formatFuelMoney(spend.scale)} · DEF ${formatFuelMoney(spend.def)} · Money ${formatFuelMoney(spend.money)}. Unassigned ${formatFuelMoney(report.fleet.unassignedAmount)}.`,
  ];
  if (report.fleet.worst3.length) {
    lines.push(
      `Worst MPG: ${report.fleet.worst3.map((row) => `${row.driverName} ${n(row.mpg)}`).join("; ")}`,
    );
  }
  if (report.fleet.best3.length) {
    lines.push(`Best MPG: ${report.fleet.best3.map((row) => `${row.driverName} ${n(row.mpg)}`).join("; ")}`);
  }
  if (report.greenLights.length) {
    lines.push(
      `Green lights: ${report.greenLights.map((row) => `${row.driverName} ${n(row.mpg)}`).join("; ")}`,
    );
  } else {
    lines.push("Green lights: none.");
  }
  if (report.flags.length) {
    lines.push(
      ...report.flags.slice(0, 8).map((flag, index) => {
        const unit = flag.unit.trim() ? ` · unit ${flag.unit.trim()}` : "";
        const tone = flag.severity === "high" ? "red" : "yellow";
        return `${index + 1}. ${tone} ${flag.driverName}${unit} · ${flag.kind.replace("_", " ")} · ${flag.product} · ${flag.metric}. ${flag.why}`;
      }),
    );
  } else {
    lines.push("No fuel-audit flags.");
  }
  if (report.fleet.idleIsh.length) {
    lines.push(
      `Idle-ish: ${report.fleet.idleIsh.map((row) => `${row.driverName} (${row.why})`).join("; ")}`,
    );
  }
  if (report.fleet.fuelNoMiles.length || report.fleet.milesNoFuel.length) {
    lines.push(
      `Fuel no miles: ${report.fleet.fuelNoMiles.map((row) => row.driverName).join(", ") || "none"}. Miles no fuel: ${report.fleet.milesNoFuel.map((row) => row.driverName).join(", ") || "none"}.`,
    );
  }
  lines.push(
    `Full markdown/HTML is filed on Fuel for the week of ${formatMdYDisplay(report.week.startYmd)}. Draft to JC only.`,
  );
  return lines.join("\n");
}

export function closeoutWeekStartFromQuestion(
  parsed: MikeFuelCloseoutQuestion,
  now = new Date(),
): string {
  if (parsed.week === "current") return parseFuelWeekStart(undefined, now);
  if (parsed.week === "week" && parsed.weekStartYmd) return parseFuelWeekStart(parsed.weekStartYmd, now);
  return closedFuelWeekStart(now);
}
