import { daysUntil } from "./compliance";
import { formatDurationMs, formatDutyStatus, isLiveSamsaraHos, type HosClock } from "./integrations/samsara";
import {
  cleanSafetyDate,
  expiryRank,
  hosSafetyDetail,
  safetyTitle,
  sortSafetyRows,
  worstSafetyRank,
  type SafetyRank,
  type SafetyRow,
} from "./safety-shared";
import type { Driver } from "./types";

export function buildSafetyBoard(input: {
  drivers: Driver[];
  windowDays: number;
  insurance: { provider: string; policy: string; expires: string };
  tokenSet: boolean;
  hos: HosClock[];
  now?: Date;
}): { insurance: SafetyRow | null; rows: SafetyRow[] } {
  const now = input.now ?? new Date();
  const insuranceExpires = cleanSafetyDate(input.insurance.expires);
  const insurance =
    insuranceExpires || input.insurance.provider.trim() || input.insurance.policy.trim()
      ? insuranceRow(input.insurance, input.windowDays, now)
      : null;
  const rows = input.drivers.map((driver) =>
    driverSafetyRow({
      driver,
      windowDays: input.windowDays,
      tokenSet: input.tokenSet,
      hos: input.hos.find((clock) => clock.driverId === driver.id) ?? null,
      now,
    }),
  );
  return { insurance, rows: sortSafetyRows(rows) };
}

function insuranceRow(
  insurance: { provider: string; policy: string; expires: string },
  windowDays: number,
  now: Date,
): SafetyRow {
  const expires = cleanSafetyDate(insurance.expires);
  const rank = expiryRank(expires, windowDays, now);
  const worst: SafetyRank = rank === "empty" ? "ok" : rank;
  const days = expires ? daysUntil(expires, now) : null;
  return {
    id: "company-insurance",
    subject: insurance.provider.trim() || "Company insurance",
    subjectKind: "company",
    driverType: "",
    rank: worst,
    title: worst === "ok" ? (expires ? `Expires ${expires}` : "On file") : safetyTitle(worst),
    licenseExpires: expires,
    medicalLast: "",
    medicalNext: "",
    drugLast: "",
    drugNext: "",
    hos: days == null ? "" : days < 0 ? `Expired ${Math.abs(days)} day(s)` : `${days} day(s)`,
  };
}

function driverSafetyRow(input: {
  driver: Driver;
  windowDays: number;
  tokenSet: boolean;
  hos: HosClock | null;
  now: Date;
}): SafetyRow {
  const license = cleanSafetyDate(input.driver.license_expires);
  const medicalLast = cleanSafetyDate(input.driver.medical_issued);
  const medicalNext = cleanSafetyDate(input.driver.medical_expires);
  const drugLast = cleanSafetyDate(input.driver.drug_test_last);
  const drugNext = cleanSafetyDate(input.driver.drug_test_next);
  const live = input.tokenSet && isLiveSamsaraHos(input.hos) ? input.hos : null;
  const hos = hosSafetyDetail({
    tokenSet: input.tokenSet,
    samsaraDriverId: input.driver.samsara_driver_id,
    hasClock: Boolean(live),
    driveRemainingMs: live?.driveRemainingMs,
    timeUntilBreakMs: live?.timeUntilBreakMs,
    driveRemainingLabel: live ? `${formatDurationMs(live.driveRemainingMs)} remaining` : "",
    dutyStatus: live ? formatDutyStatus(live.dutyStatus) : "",
  });
  const rank = worstSafetyRank([
    expiryRank(license, input.windowDays, input.now),
    expiryRank(medicalNext, input.windowDays, input.now),
    expiryRank(drugNext, input.windowDays, input.now),
    hos.rank,
  ]);
  return {
    id: `driver-${input.driver.id}`,
    subject: input.driver.name,
    subjectKind: "driver",
    driverType: input.driver.driver_type,
    rank,
    title: safetyTitle(rank),
    licenseExpires: license,
    medicalLast,
    medicalNext,
    drugLast,
    drugNext,
    hos: hos.detail,
  };
}
