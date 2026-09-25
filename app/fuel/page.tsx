import Link from "next/link";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Fuel");
import { AccessDenied } from "@/components/access-denied";
import { FuelCsvImport } from "@/components/fuel-csv-import";
import { FuelDeskPaintMark } from "@/components/fuel-desk-paint-mark";
import { FuelDeskTabs } from "@/components/fuel-desk-tabs";
import { FuelMatchQueue } from "@/components/fuel-match-queue";
import { FuelMpgTable } from "@/components/fuel-mpg-table";
import { FuelRollupTable } from "@/components/fuel-rollup-table";
import { FuelAuditStrip } from "@/components/fuel-audit-strip";
import { FuelCloseoutStrip } from "@/components/fuel-closeout-strip";
import { FuelWeekSpendCards, FuelWeekStrip } from "@/components/fuel-week-strip";
import { PageHeader } from "@/components/page-header";
import { FuelTransactionLists, FuelUnassignedLists, FuelViewTabs, fuelPageHref } from "@/components/fuel-transaction-lists";
import { canExportCsv, canUploadFuel, getPageAccess } from "@/lib/dispatcher-session";
import { fuelAuditWindowForWeek, scoreFuelAudit } from "@/lib/fuel-audit";
import { parseFuelPageView, parseFuelTxList, type FuelRollup } from "@/lib/fuel";
import { fuelDeskMounts, resolveFuelDeskPanel } from "@/lib/fuel-desk";
import { parseDirectoryPage } from "@/lib/directory-page";
import { listDriverMpg, parseDriverMpgPeriod } from "@/lib/fuel-mpg";
import { buildLiveFuelCloseout, fileFuelCloseout } from "@/lib/fuel-closeout-store";
import { listFuelTransactions, loadFuelWeekSpend, loadFuelWeekView, rematchUnmatchedFuelTransactions } from "@/lib/fuel-store";
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
    panel?: string;
    page?: string;
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
  const panel = resolveFuelDeskPanel({
    panel: params.panel,
    driverId: selectedDriverId,
    truckId: selectedTruckId,
    view: params.view,
  });
  const mounts = fuelDeskMounts(panel);
  const page = parseDirectoryPage(params.page);
  if (mounts.transactions) rematchUnmatchedFuelTransactions();
  const weekView = mounts.transactions
    ? loadFuelWeekView(params.week)
    : {
        ...loadFuelWeekSpend(params.week),
        driverRollups: [] as FuelRollup[],
        truckRollups: [] as FuelRollup[],
      };
  const week = weekView.weekStartYmd;
  const drivers = mounts.transactions ? listDrivers() : [];
  const trucks = mounts.transactions ? listTrucks() : [];
  const loadOptions = mounts.transactions
    ? listLoads({ status: "all" })
        .filter((load) => load.status !== "cancelled")
        .slice(0, 80)
        .map((load) => ({ id: load.id, label: `${load.load_number} · ${load.destination}` }))
    : [];
  const driverOptions = drivers.map((driver) => ({ id: driver.id, label: driver.name }));
  const selectedDriver = selectedDriverId ? drivers.find((driver) => driver.id === selectedDriverId) : null;
  const selectedTruck = selectedTruckId ? trucks.find((truck) => truck.id === selectedTruckId) : null;
  const weekFilter = { fromIso: weekView.fromIso, toIso: weekView.toIso };
  const transactions = mounts.transactions
    ? listFuelTransactions(
        selectedDriverId
          ? { driverId: selectedDriverId, ...weekFilter }
          : selectedTruckId
            ? { truckId: selectedTruckId, ...weekFilter }
            : weekFilter,
      )
    : [];
  const unmatched = mounts.transactions ? listFuelTransactions({ unmatchedOnly: true, ...weekFilter }) : [];
  const closeout = mounts.closeout
    ? fileFuelCloseout(buildLiveFuelCloseout({ weekStartYmd: week, now: weekView.mpgNow })).report
    : null;
  const mpgBoard = mounts.mpg ? listDriverMpg(mpgPeriod, weekView.mpgNow) : null;
  const audit = mounts.audit
    ? scoreFuelAudit(listFuelTransactions(weekFilter), fuelAuditWindowForWeek(week))
    : null;
  const filterLabel = selectedDriver
    ? `Transactions — ${selectedDriver.name}`
    : selectedTruck
      ? `Transactions — Unit ${selectedTruck.unit_number}`
      : weekView.current
        ? "Transactions"
        : "Transactions — saved week";
  const hrefForPage = (nextPage: number) =>
    fuelPageHref({
      panel,
      view,
      tx: txList,
      mpg: mpgPeriod,
      driverId: selectedDriverId,
      truckId: selectedTruckId,
      week,
      page: nextPage,
    });

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
      <FuelDeskTabs
        panel={panel}
        query={{
          view,
          tx: txList,
          mpg: mpgPeriod,
          driverId: selectedDriverId,
          truckId: selectedTruckId,
          week,
        }}
      />
      <div id={`fuel-panel-${panel}`} role="tabpanel" aria-labelledby={`fuel-tab-${panel}`} data-fuel-desk-panel={panel}>
        {mounts.spend ? <FuelWeekSpendCards spent={weekView.spent} current={weekView.current} /> : null}
        {audit ? <FuelAuditStrip report={audit} /> : null}
        {closeout ? <FuelCloseoutStrip report={closeout} page={page} hrefForPage={hrefForPage} /> : null}
        {mounts.weekStrip ? (
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
              panel,
            }}
          />
        ) : null}
        {mpgBoard ? (
          <FuelMpgTable
            board={mpgBoard}
            selectedDriverId={selectedDriverId}
            selectedTruckId={selectedTruckId}
            txList={txList}
            view={view}
            week={week}
            page={page}
            hrefForPage={hrefForPage}
          />
        ) : null}
        {mounts.import ? <FuelCsvImport /> : null}
        {mounts.receipts ? <FuelMatchQueue page={page} hrefForPage={hrefForPage} /> : null}
        {mounts.transactions ? (
          <FuelRollupTable
            title="Per-driver totals"
            rows={weekView.driverRollups}
            hrefFor={(row) => fuelPageHref({ driverId: row.id, mpg: mpgPeriod, view, tx: txList, week })}
          />
        ) : null}
        {mounts.transactions ? (
          <FuelViewTabs
            view={view}
            mpgPeriod={mpgPeriod}
            selectedDriverId={selectedDriverId}
            selectedTruckId={selectedTruckId}
            txList={txList}
            week={week}
            panel={panel}
          />
        ) : null}
        {mounts.transactions && view === "trucks" ? (
          <FuelRollupTable
            title="Per-truck totals"
            rows={weekView.truckRollups}
            hrefFor={(row) => fuelPageHref({ truckId: row.id, mpg: mpgPeriod, view, tx: txList, week })}
          />
        ) : mounts.transactions ? (
          <>
            <FuelUnassignedLists
              rows={unmatched}
              drivers={driverOptions}
              loads={loadOptions}
              week={week}
              page={page}
              hrefForPage={hrefForPage}
            />
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
              page={page}
              hrefForPage={hrefForPage}
              panel={panel}
            />
          </>
        ) : null}
      </div>
      <FuelDeskPaintMark panel={panel} heavyMounted={!mounts.spend} />
    </>
  );
}
