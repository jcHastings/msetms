import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { TollCsvImport } from "@/components/toll-csv-import";
import { TollRollupTable } from "@/components/toll-rollup-table";
import { TollTransactionLists, TollUnassignedLists, tollPageHref } from "@/components/toll-transaction-lists";
import { TollFleetCards, TollWeekStrip } from "@/components/toll-week-strip";
import { deskMetadata } from "@/lib/desk-metadata";
import { canUploadFuel, getPageAccess } from "@/lib/dispatcher-session";
import { describePrepassPullStatus } from "@/lib/prepass-client";
import { loadTollPeriodView } from "@/lib/tolls-store";
import { parseTollPeriod, parseTollTxList } from "@/lib/tolls";
import { listDrivers, listLoads, listTrucks } from "@/lib/queries";

export const metadata = deskMetadata("Tolls");
export const dynamic = "force-dynamic";

export default async function TollsPage({
  searchParams,
}: {
  searchParams: Promise<{
    driver?: string;
    truck?: string;
    tx?: string;
    week?: string;
    period?: string;
  }>;
}) {
  const dispatcher = await getPageAccess(canUploadFuel);
  if (!dispatcher) {
    return <AccessDenied message="Tolls is for Administrator and Standard." />;
  }
  const params = await searchParams;
  const driverId = Number.parseInt(params.driver ?? "", 10);
  const truckId = Number.parseInt(params.truck ?? "", 10);
  const txList = parseTollTxList(params.tx);
  const period = parseTollPeriod(params.period);
  const selectedDriverId = Number.isFinite(driverId) ? driverId : null;
  const selectedTruckId = Number.isFinite(truckId) ? truckId : null;
  const view = loadTollPeriodView({ week: params.week, period });
  const drivers = listDrivers();
  const trucks = listTrucks();
  const selectedDriver = selectedDriverId ? drivers.find((driver) => driver.id === selectedDriverId) : null;
  const selectedTruck = selectedTruckId ? trucks.find((truck) => truck.id === selectedTruckId)?.unit_number : null;
  const loadOptions = listLoads({ status: "all" })
    .filter((load) => load.status !== "cancelled")
    .slice(0, 80)
    .map((load) => ({ id: load.id, label: `${load.load_number} · ${load.destination}` }));
  const driverOptions = drivers.map((driver) => ({ id: driver.id, label: driver.name }));
  const filtered = view.transactions.filter((row) => {
    if (selectedDriverId && row.driver_id !== selectedDriverId) return false;
    if (selectedTruckId && row.truck_id !== selectedTruckId) return false;
    return true;
  });
  const unmatched = view.unmatched.filter((row) => {
    if (selectedDriverId && row.driver_id !== selectedDriverId) return false;
    if (selectedTruckId && row.truck_id !== selectedTruckId) return false;
    return true;
  });
  const filterLabel = selectedDriver
    ? `Transactions — ${selectedDriver.name}`
    : selectedTruck
      ? `Transactions — ${selectedTruck}`
      : "Transactions";

  return (
    <>
      <PageHeader
        title="Tolls"
        actions={
          <>
            <a href="/api/tolls/export" className="btn btn-secondary">
              Download all tolls
            </a>
            <Link href="/fuel" className="btn btn-secondary">
              Fuel
            </Link>
          </>
        }
      />
      <TollFleetCards totals={view.totals} period={period} />
      <TollWeekStrip
        weeks={view.weeks}
        selectedWeek={view.weekStartYmd}
        currentWeek={view.currentWeek}
        period={period}
        periodStartYmd={view.periodStartYmd}
        periodEndYmd={view.periodEndYmd}
        query={{ driverId: selectedDriverId, truckId: selectedTruckId, tx: txList }}
      />
      <TollCsvImport pullStatus={describePrepassPullStatus()} />
      <TollRollupTable
        title={period === "month" ? "Per-driver totals (month)" : "Per-driver totals (week)"}
        rows={view.driverRollups}
        hrefFor={(row) => tollPageHref({ driverId: row.id, tx: txList, week: view.weekStartYmd, period })}
      />
      <TollUnassignedLists
        rows={unmatched}
        drivers={driverOptions}
        loads={loadOptions}
        week={view.weekStartYmd}
        period={period}
      />
      <TollTransactionLists
        rows={filtered}
        active={txList}
        title={filterLabel}
        showAllLink={Boolean(selectedDriver || selectedTruck)}
        period={period}
        selectedDriverId={selectedDriverId}
        selectedTruckId={selectedTruckId}
        drivers={driverOptions}
        loads={loadOptions}
        week={view.weekStartYmd}
      />
    </>
  );
}
