import { getDb } from "./db";
import { buildFuelCloseout, type FuelCloseoutReport, type FuelCloseoutTx } from "./fuel-closeout";
import { renderFuelCloseoutHtml, renderFuelCloseoutMarkdown } from "./fuel-closeout-export";
import { listFuelTransactions } from "./fuel-store";
import { engineHoursFromReadings, samsaraEngineHoursSourceStatus, type EngineHourSubject } from "./engine-hours";
import { weekIdleFuelQuotes, type FuelFillPrice, type IdleFuelQuote } from "./idle-fuel-cost";
import { isCurrentFuelWeek, localWeekRange, parseFuelWeekStart } from "./fuel";
import {
  getSamsaraFleet,
  hydrateSamsaraEngineHourWindow,
  hydrateSamsaraOdometerWindow,
  isSamsaraConfigured,
} from "./integrations/samsara";
import {
  closedFuelWeekStart,
  milesFromSamsaraOdometer,
  milesWindowForWeek,
  persistedSamsaraMilesSource,
  priorFuelWeekStart,
  samsaraMilesSourceStatus,
  type MilesReading,
} from "./miles-source";
import { listTruckEngineHourReadings } from "./queries";

export type FiledFuelCloseout = {
  weekStartYmd: string;
  weekEndYmd: string;
  closed: boolean;
  markdown: string;
  html: string;
  report: FuelCloseoutReport;
  filedAt: string;
};

type FiledRow = {
  week_start_ymd: string;
  week_end_ymd: string;
  closed: number;
  markdown: string;
  html: string;
  report_json: string;
  filed_at: string;
};

function asTx(row: FuelCloseoutTx): FuelCloseoutTx {
  return row;
}

function asFillPrice(row: FuelCloseoutTx): FuelFillPrice {
  const priced = row as FuelCloseoutTx & { price_per_gallon?: number | null };
  return {
    occurred_at: row.occurred_at,
    driver_id: row.driver_id,
    truck_id: row.truck_id ?? null,
    category: row.category,
    gallons: row.gallons,
    amount: row.amount,
    price_per_gallon: priced.price_per_gallon ?? null,
  };
}

export function buildLiveFuelCloseout(input?: {
  weekStartYmd?: string;
  now?: Date;
  rows?: FuelCloseoutTx[];
  miles?: MilesReading[];
  hours?: EngineHourSubject[];
  engineHoursError?: string;
  idleFuel?: IdleFuelQuote[];
  prior?: { rows: FuelCloseoutTx[]; miles: MilesReading[] };
}): FuelCloseoutReport {
  const now = input?.now ?? new Date();
  const weekStartYmd = parseFuelWeekStart(input?.weekStartYmd, now);
  const rows = input?.rows ?? listFuelTransactions().map(asTx);
  const window = milesWindowForWeek(weekStartYmd);
  const miles = input?.miles ?? milesFromSamsaraOdometer(window);
  const hours = input?.hours ?? engineHoursFromReadings(window);
  const idleFuel =
    input?.idleFuel ??
    weekIdleFuelQuotes(
      hours.map((row) => ({
        subjectKey: row.subjectKey,
        driverId: row.driverId,
        unit: row.unit,
        truckId: row.truckId,
      })),
      rows.map(asFillPrice),
      window,
    );
  const priorStart = priorFuelWeekStart(weekStartYmd);
  const prior =
    input?.prior ??
    {
      rows,
      miles: milesFromSamsaraOdometer(milesWindowForWeek(priorStart)),
    };
  return buildFuelCloseout({
    weekStartYmd,
    now,
    rows,
    miles,
    hours,
    idleFuel,
    prior,
    milesSource: persistedSamsaraMilesSource().status(),
    engineHoursSource: samsaraEngineHoursSourceStatus({
      tokenSet: isSamsaraConfigured(),
      readingCount: listTruckEngineHourReadings().length,
      error: input?.engineHoursError,
    }),
  });
}

export function fileFuelCloseout(report: FuelCloseoutReport): FiledFuelCloseout {
  const markdown = renderFuelCloseoutMarkdown(report);
  const html = renderFuelCloseoutHtml(report);
  const filedAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO fuel_closeout_reports (
         week_start_ymd, week_end_ymd, closed, markdown, html, report_json, filed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(week_start_ymd) DO UPDATE SET
         week_end_ymd = excluded.week_end_ymd,
         closed = excluded.closed,
         markdown = excluded.markdown,
         html = excluded.html,
         report_json = excluded.report_json,
         filed_at = excluded.filed_at`,
    )
    .run(
      report.week.startYmd,
      report.week.endYmd,
      report.week.closed ? 1 : 0,
      markdown,
      html,
      JSON.stringify(report),
      filedAt,
    );
  return {
    weekStartYmd: report.week.startYmd,
    weekEndYmd: report.week.endYmd,
    closed: report.week.closed,
    markdown,
    html,
    report,
    filedAt,
  };
}

export function getFiledFuelCloseout(weekStartYmd: string): FiledFuelCloseout | null {
  const row = getDb()
    .prepare("SELECT * FROM fuel_closeout_reports WHERE week_start_ymd = ?")
    .get(weekStartYmd) as FiledRow | undefined;
  if (!row) return null;
  return {
    weekStartYmd: row.week_start_ymd,
    weekEndYmd: row.week_end_ymd,
    closed: Boolean(row.closed),
    markdown: row.markdown,
    html: row.html,
    report: JSON.parse(row.report_json) as FuelCloseoutReport,
    filedAt: row.filed_at,
  };
}

export function listFiledFuelCloseouts(): FiledFuelCloseout[] {
  return (
    getDb()
      .prepare("SELECT * FROM fuel_closeout_reports ORDER BY week_start_ymd DESC")
      .all() as FiledRow[]
  ).map((row) => ({
    weekStartYmd: row.week_start_ymd,
    weekEndYmd: row.week_end_ymd,
    closed: Boolean(row.closed),
    markdown: row.markdown,
    html: row.html,
    report: JSON.parse(row.report_json) as FuelCloseoutReport,
    filedAt: row.filed_at,
  }));
}

export async function loadAndFileFuelCloseout(input?: {
  week?: string;
  now?: Date;
  hydrate?: boolean;
  defaultClosedWeek?: boolean;
}): Promise<FuelCloseoutReport> {
  const now = input?.now ?? new Date();
  const weekStartYmd = input?.week
    ? parseFuelWeekStart(input.week, now)
    : input?.defaultClosedWeek
      ? closedFuelWeekStart(now)
      : localWeekRange(now).startYmd;
  let engineHoursError: string | undefined;
  if (input?.hydrate !== false) {
    try {
      await getSamsaraFleet();
      const window = milesWindowForWeek(weekStartYmd);
      const toIso = isCurrentFuelWeek(weekStartYmd, now) ? now.toISOString() : window.toIso;
      await hydrateSamsaraOdometerWindow({
        fromIso: window.fromIso,
        toIso,
      });
      const prior = milesWindowForWeek(priorFuelWeekStart(weekStartYmd));
      await hydrateSamsaraOdometerWindow({ fromIso: prior.fromIso, toIso: prior.toIso });
      const hoursPull = await hydrateSamsaraEngineHourWindow({ fromIso: window.fromIso, toIso });
      if (hoursPull.error) engineHoursError = hoursPull.error;
    } catch {
      // Persist whatever we already have. Status stays honest.
    }
  }
  const report = buildLiveFuelCloseout({ weekStartYmd, now, engineHoursError });
  fileFuelCloseout(report);
  return report;
}

export function closeoutExportHref(weekStartYmd: string, format: "md" | "html"): string {
  const query = new URLSearchParams({ week: weekStartYmd, format });
  return `/api/fuel/closeout?${query.toString()}`;
}

export { samsaraMilesSourceStatus, closedFuelWeekStart };
