import Link from "next/link";
import { FuelDeleteButton } from "@/components/fuel-delete-button";
import { FuelTablePager } from "@/components/fuel-table-pager";
import { linkFuelReceiptFormAction } from "@/lib/actions";
import { paginateDirectory } from "@/lib/directory-page";
import { FUEL_TABLE_PAGE_SIZE } from "@/lib/fuel-desk";
import { listFuelMatchQueue, listFuelReceipts } from "@/lib/fuel-receipts";
import { formatDateTime, formatFuelMoney, formatGallons } from "@/lib/format";

const MATCH_SELECT_CAP = 40;

const FUEL_STATUS_META = {
  matched: { icon: "✓", label: "Matched" },
  no_photo: { icon: "–", label: "No photo" },
  wrong_state: { icon: "!", label: "Wrong state" },
  gallons_off: { icon: "↕", label: "Gallons off" },
} as const;

function FuelStatusIcon({
  status,
}: {
  status: "matched" | "no_photo" | "wrong_state" | "gallons_off";
}) {
  const meta = FUEL_STATUS_META[status];
  return (
    <span className={`fuel-status fuel-status-${status}`} data-fuel-status={status} title={meta.label}>
      {meta.icon}
    </span>
  );
}

export function FuelMatchQueue({
  page = 1,
  hrefForPage,
}: {
  page?: number;
  hrefForPage?: (page: number) => string;
} = {}) {
  const queue = listFuelMatchQueue();
  const linked = new Set(queue.map((row) => row.receipt?.id).filter((id): id is number => id != null));
  const looseReceipts = listFuelReceipts().filter((receipt) => !linked.has(receipt.id));
  const unmatchedCards = queue.filter((row) => row.status === "no_photo");
  const lines = [
    ...queue.map((row) => ({ key: `t-${row.transaction.id}`, kind: "card" as const, row, receipt: null })),
    ...looseReceipts.map((receipt) => ({ key: `r-${receipt.id}`, kind: "loose" as const, row: null, receipt })),
  ];
  const paged = paginateDirectory(lines, page, FUEL_TABLE_PAGE_SIZE);
  return (
    <section className="card mb-6 overflow-hidden" data-fuel-match-queue="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Receipt match</h2>
        {looseReceipts.length > MATCH_SELECT_CAP || unmatchedCards.length > MATCH_SELECT_CAP ? (
          <p className="mt-1 text-xs text-slate-500">Photo and card pickers list the latest {MATCH_SELECT_CAP}.</p>
        ) : null}
      </header>
      <div className="overflow-x-auto">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Verification</th>
              <th>When</th>
              <th>Unit</th>
              <th>Gallons</th>
              <th>Amount</th>
              <th>Station</th>
              <th>Load</th>
              <th>Fix</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((line) =>
              line.kind === "card" && line.row ? (
                <MatchCardRow key={line.key} row={line.row} looseReceipts={looseReceipts} />
              ) : line.receipt ? (
                <LooseReceiptRow key={line.key} receipt={line.receipt} unmatchedCards={unmatchedCards} />
              ) : null,
            )}
          </tbody>
        </table>
      </div>
      {hrefForPage ? (
        <FuelTablePager
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          hrefForPage={hrefForPage}
          label="Receipt match"
        />
      ) : null}
      <footer className="fuel-status-legend">
        {(Object.keys(FUEL_STATUS_META) as Array<keyof typeof FUEL_STATUS_META>).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <FuelStatusIcon status={status} />
            {FUEL_STATUS_META[status].label}
          </span>
        ))}
      </footer>
    </section>
  );
}

function MatchCardRow({
  row,
  looseReceipts,
}: {
  row: ReturnType<typeof listFuelMatchQueue>[number];
  looseReceipts: ReturnType<typeof listFuelReceipts>;
}) {
  const photos = looseReceipts.slice(0, MATCH_SELECT_CAP);
  return (
    <tr>
      <td>
        <FuelStatusIcon status={row.status} />
      </td>
      <td>{formatDateTime(row.transaction.occurred_at)}</td>
      <td>{row.transaction.truck_unit || row.transaction.unit_number || "—"}</td>
      <td>{formatGallons(row.transaction.gallons)}</td>
      <td>{formatFuelMoney(row.transaction.amount)}</td>
      <td>{row.transaction.location || "—"}</td>
      <td>
        {row.loadId ? (
          <Link href={`/loads/${row.loadId}`} className="underline">
            {row.loadNumber || row.loadId}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td>
        {row.status === "matched" ? (
          <span className="text-xs text-slate-500">matched</span>
        ) : row.receipt ? (
          <form action={linkFuelReceiptFormAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="receipt_id" value={row.receipt.id} />
            <input type="hidden" name="fuel_id" value={row.transaction.id} />
            <button className="btn btn-ghost" type="submit">
              Match
            </button>
          </form>
        ) : photos.length ? (
          <form action={linkFuelReceiptFormAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="fuel_id" value={row.transaction.id} />
            <select name="receipt_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm" required>
              <option value="">Photo…</option>
              {photos.map((receipt) => (
                <option key={receipt.id} value={receipt.id}>
                  Load {receipt.load_id}
                  {receipt.gallons != null ? ` · ${receipt.gallons} gal` : ""}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost" type="submit">
              Match
            </button>
          </form>
        ) : (
          <span className="text-xs text-slate-500">no photo</span>
        )}
      </td>
      <td>
        <FuelDeleteButton fuelId={row.transaction.id} />
      </td>
    </tr>
  );
}

function LooseReceiptRow({
  receipt,
  unmatchedCards,
}: {
  receipt: ReturnType<typeof listFuelReceipts>[number];
  unmatchedCards: ReturnType<typeof listFuelMatchQueue>;
}) {
  const cards = unmatchedCards.slice(0, MATCH_SELECT_CAP);
  return (
    <tr>
      <td>
        <FuelStatusIcon status="no_photo" />
      </td>
      <td>{formatDateTime(receipt.occurred_at || receipt.created_at)}</td>
      <td>—</td>
      <td>{receipt.gallons ?? "—"}</td>
      <td>—</td>
      <td>{receipt.station || receipt.state || "—"}</td>
      <td>
        <Link href={`/loads/${receipt.load_id}`} className="underline">
          {receipt.load_id}
        </Link>
      </td>
      <td>
        {cards.length ? (
          <form action={linkFuelReceiptFormAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="receipt_id" value={receipt.id} />
            <select name="fuel_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm" required>
              <option value="">Card row…</option>
              {cards.map((row) => (
                <option key={row.transaction.id} value={row.transaction.id}>
                  {row.transaction.truck_unit || row.transaction.unit_number || "card"} ·{" "}
                  {formatDateTime(row.transaction.occurred_at)}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost" type="submit">
              Match
            </button>
          </form>
        ) : (
          <span className="text-xs text-slate-500">no card row</span>
        )}
      </td>
      <td></td>
    </tr>
  );
}

export function LoadTiedFuelReceipts() {
  const receipts = listFuelReceipts();
  const queue = listFuelMatchQueue();
  return (
    <section className="card mb-4 overflow-hidden">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Load receipts</h2>
      </header>
      {receipts.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">No load-tied fuel receipts yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2">Load</th>
              <th className="px-5 py-2">When</th>
              <th className="px-5 py-2">Gallons</th>
              <th className="px-5 py-2">Station</th>
              <th className="px-5 py-2">Card row</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => {
              const match = queue.find((row) => row.receipt?.id === receipt.id);
              return (
                <tr key={receipt.id} className="border-t border-slate-100">
                  <td className="px-5 py-2">
                    {receipt.load_id ? (
                      <Link href={`/loads/${receipt.load_id}`} className="font-semibold underline">
                        {match?.loadNumber || receipt.load_id}
                      </Link>
                    ) : (
                      <span className="text-slate-500">Pending match</span>
                    )}
                  </td>
                  <td className="px-5 py-2">{formatDateTime(receipt.occurred_at || receipt.created_at)}</td>
                  <td className="px-5 py-2 tabular-nums">{receipt.gallons ?? "—"}</td>
                  <td className="px-5 py-2">{receipt.station || receipt.state || "—"}</td>
                  <td className="px-5 py-2">{match ? match.status : "open"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
