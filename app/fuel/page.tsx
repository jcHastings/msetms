import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { FuelCsvImport } from "@/components/fuel-csv-import";
import { FuelMatchQueue } from "@/components/fuel-match-queue";
import { FuelMpgTable } from "@/components/fuel-mpg-table";
import { FuelRollupTable } from "@/components/fuel-rollup-table";
import { FuelWeekStrip } from "@/components/fuel-week-strip";
import { PageHeader } from "@/components/page-header";
import { FuelTransactionLists, FuelUnassignedLists, FuelViewTabs } from "@/components/fuel-transaction-lists";
import { canExportCsv, canUploadFuel, getPageAccess } from "@/lib/dispatcher-session";
import { parseFuelPageView, parseFuelTxList } from "@/lib/fuel";
import { listDriverMpg, parseDriverMpgPeriod } from "@/lib/fuel-mpg";
import {
  getFuelWeekPaidStats,
  listFuelRollups,
  listFuelTransactions,
  listTruckFuelRollups,
  rematchUnmatchedFuelTransactions,
} from "@/lib/fuel-store";
import { getSamsaraFleet } from "@/lib/integrations/samsara";
import { listDrivers, listLoads, listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<{ driver?: string; truck?: string; mpg?: string; tx?: string; view?: string }>;
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
  const drivers = listDrivers();
  const trucks = listTrucks();
  const loadOptions = listLoads({ status: "all" })
    .filter((load) => load.status !== "cancelled")
    .slice(0, 80)
    .map((load) => ({ id: load.id, label: `${load.load_number} · ${load.destination}` }));
  const driverOptions = drivers.map((driver) => ({ id: driver.id, label: driver.name }));
  const selectedDriver = selectedDriverId ? drivers.find((driver) => driver.id === selectedDriverId) : null;
  const selectedTruck = selectedTruckId ? trucks.find((truck) => truck.id === selectedTruckId) : null;
  const transactions = listFuelTransactions(
    selectedDriverId ? { driverId: selectedDriverId } : selectedTruckId ? { truckId: selectedTruckId } : undefined,
  );
  const unmatched = listFuelTransactions({ unmatchedOnly: true });
  const driverRollups = listFuelRollups();
  const truckRollups = listTruckFuelRollups();
  const weekStats = getFuelWeekPaidStats();
  await getSamsaraFleet();
  const mpgBoard = listDriverMpg(mpgPeriod);
  const filterLabel = selectedDriver
    ? `Transactions — ${selectedDriver.name}`
    : selectedTruck
      ? `Transactions — Unit ${selectedTruck.unit_number}`
      : "Transactions";

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
      <FuelWeekStrip stats={weekStats} />
      <FuelMpgTable
        board={mpgBoard}
        selectedDriverId={selectedDriverId}
        selectedTruckId={selectedTruckId}
        txList={txList}
        view={view}
      />
      <FuelCsvImport />
      <FuelMatchQueue />
      <FuelRollupTable title="Per-driver totals" rows={driverRollups} hrefFor={(row) => `/fuel?driver=${row.id}`} />

      <FuelViewTabs
        view={view}
        mpgPeriod={mpgPeriod}
        selectedDriverId={selectedDriverId}
        selectedTruckId={selectedTruckId}
        txList={txList}
      />

      {view === "trucks" ? (
        <FuelRollupTable title="Per-truck totals" rows={truckRollups} hrefFor={(row) => `/fuel?truck=${row.id}`} />
      ) : (
        <>
          <FuelUnassignedLists rows={unmatched} drivers={driverOptions} loads={loadOptions} />
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
          />
        </>
      )}
    </>
  );
}
