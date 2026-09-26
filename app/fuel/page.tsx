import Link from "next/link";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Fuel");
import { AccessDenied } from "@/components/access-denied";
import { FuelCsvImport } from "@/components/fuel-csv-import";
import { FuelMatchQueue } from "@/components/fuel-match-queue";
import { FuelMpgTable } from "@/components/fuel-mpg-table";
import { FuelRollupTable } from "@/components/fuel-rollup-table";
import { FuelAuditStrip } from "@/components/fuel-audit-strip";
import { FuelCloseoutStrip } from "@/components/fuel-closeout-strip";
import { IdleFuelEstimate } from "@/components/idle-fuel-estimate";
import { FuelWeekSpendCards, FuelWeekStrip } from "@/components/fuel-week-strip";
import { PageHeader } from "@/components/page-header";
import { FuelTransactionLists, FuelUnassignedLists, FuelViewTabs, fuelPageHref } from "@/components/fuel-transaction-lists";
import { canExportCsv, canUploadFuel, getPageAccess } from "@/lib/dispatcher-session";
import { fuelAuditWindowForWeek, scoreFuelAudit } from "@/lib/fuel-audit";
import { parseFuelPageView, parseFuelTxList } from "@/lib/fuel";
import { listDriverMpg, parseDriverMpgPeriod } from "@/lib/fuel-mpg";
import { buildLiveFuelCloseout, fileFuelCloseout } from "@/lib/fuel-closeout-store";
import { buildIdleFuelCostBoard, idleFuelHydrateRange } from "@/lib/idle-fuel-cost";
import { listFuelTransactions, loadFuelWeekView, rematchUnmatchedFuelTransactions } from "@/lib/fuel-store";
import { getSamsaraFleet, hydrateSamsaraEngineHourWindow } from "@/lib/integrations/samsara";
import { listDrivers, listLoads, listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<{
    driver?: string;
    truck?: string;
    mpg?: string;
    tx?: string;
    view?: string;
    week?: string;
  }>;
}) {
  const dispatcher = await getPageAccess(canUploadFuel);
  if (!dispatcher) {
    return <AccessDenied message="Fuel is for Administrator and Standard." />;
  }
  const params = await searchParams;
  const driverId = Number.parseInt(params.driver ?? "", 10);
  const truckId = Number.parseInt(params.truck ?? "", 10);
  const mpgPeriod = parseDriverMpgPeriod(params.mpg);
  const txList = parseFuelTxList(params.tx);
  const view = parseFuelPageView(params.view);
  const selectedDriverId = Number.isFinite(driverId) ? driverId : null;
  const selectedTruckId = Number.isFinite(truckId) ? truckId : null;
  rematchUnmatchedFuelTransactions();
  const weekView = loadFuelWeekView(params.week);
  const week = weekView.weekStartYmd;
  const drivers = listDrivers();
  const trucks = listTrucks();
  const loadOptions = listLoads({ status: "all" })
    .filter((load) => load.status !== "cancelled")
    .slice(0, 80)
    .map((load) => ({ id: load.id, label: `${load.load_number} · ${load.destination}` }));
  const driverOptions = drivers.map((driver) => ({ id: driver.id, label: driver.name }));
  const selectedDriver = selectedDriverId ? drivers.find((driver) => driver.id === selectedDriverId) : null;
  const selectedTruck = selectedTruckId ? trucks.find((truck) => truck.id === selectedTruckId) : null;
  const weekFilter = { fromIso: weekView.fromIso, toIso: weekView.toIso };
  const transactions = listFuelTransactions(
    selectedDriverId
      ? { driverId: selectedDriverId, ...weekFilter }
      : selectedTruckId
        ? { truckId: selectedTruckId, ...weekFilter }
        : weekFilter,
  );
  const unmatched = listFuelTransactions({ unmatchedOnly: true, ...weekFilter });
  await getSamsaraFleet();
  const hourWindow = idleFuelHydrateRange(weekView.mpgNow);
  const engineHoursPull = await hydrateSamsaraEngineHourWindow({
    fromIso: hourWindow.fromIso,
    toIso: hourWindow.toIso,
  });
  const closeout = fileFuelCloseout(
    buildLiveFuelCloseout({
      weekStartYmd: week,
      now: weekView.mpgNow,
      engineHoursError: engineHoursPull.error,
    }),
  ).report;
  const mpgBoard = listDriverMpg(mpgPeriod, weekView.mpgNow);
  const idleBoard = buildIdleFuelCostBoard(weekView.mpgNow);
  const filterLabel = selectedDriver
    ? `Transactions — ${selectedDriver.name}`
    : selectedTruck
      ? `Transactions — Unit ${selectedTruck.unit_number}`
      : weekView.current
        ? "Transactions"
        : "Transactions — saved week";

  return (
    <>
      <PageHeader
        title="Fuel"
        actions={
          <>
            {canExportCsv(dispatcher.role) ? (
              <a href="/api/fuel/export" className="btn btn-secondary">
                Download all fuel
              </a>
            ) : null}
            <Link href="/fleet/drivers" className="btn btn-secondary">
              Drivers
            </Link>
          </>
        }
      />
      <FuelWeekSpendCards
        spent={weekView.spent}
        current={weekView.current}
        idleHours={closeout.fleet.idleHours}
        engineHours={closeout.fleet.engineHours}
        idleFuelCost={closeout.fleet.idleFuelCost}
      />
      <IdleFuelEstimate board={idleBoard} />
      <FuelAuditStrip report={scoreFuelAudit(listFuelTransactions(), fuelAuditWindowForWeek(week))} />
      <FuelCloseoutStrip report={closeout} />
      <FuelWeekStrip
        stats={weekView.stats}
        weeks={weekView.weeks}
        selectedWeek={week}
        current={weekView.current}
        query={{
          view,
          tx: txList,
          mpg: mpgPeriod,
          driverId: selectedDriverId,
          truckId: selectedTruckId,
        }}
      />
      <FuelMpgTable
        board={mpgBoard}
        selectedDriverId={selectedDriverId}
        selectedTruckId={selectedTruckId}
        txList={txList}
        view={view}
        week={week}
      />
      <FuelCsvImport />
      <FuelMatchQueue />
      <FuelRollupTable
        title="Per-driver totals"
        rows={weekView.driverRollups}
        hrefFor={(row) => fuelPageHref({ driverId: row.id, mpg: mpgPeriod, view, tx: txList, week })}
      />

      <FuelViewTabs
        view={view}
        mpgPeriod={mpgPeriod}
        selectedDriverId={selectedDriverId}
        selectedTruckId={selectedTruckId}
        txList={txList}
        week={week}
      />

      {view === "trucks" ? (
        <FuelRollupTable
          title="Per-truck totals"
          rows={weekView.truckRollups}
          hrefFor={(row) => fuelPageHref({ truckId: row.id, mpg: mpgPeriod, view, tx: txList, week })}
        />
      ) : (
        <>
          <FuelUnassignedLists rows={unmatched} drivers={driverOptions} loads={loadOptions} week={week} />
          <FuelTransactionLists
            rows={transactions}
            active={txList}
            title={filterLabel}
            showAllLink={Boolean(selectedDriver || selectedTruck)}
            mpgPeriod={mpgPeriod}
            selectedDriverId={selectedDriverId}
            selectedTruckId={selectedTruckId}
            drivers={driverOptions}
            loads={loadOptions}
            week={week}
          />
        </>
      )}
    </>
  );
}
