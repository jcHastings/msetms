"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "@/components/use-dismissable";
import {
  BACKHAUL_EMPTY_TITLE,
  BACKHAUL_MISSING_TITLE,
  BACKHAUL_RADIUS_MI,
  BACKHAUL_SEARCH_FAILED,
  BACKHAUL_SEARCHING,
  backhaulEmptyDetail,
  type BackhaulLoadRow,
  type BackhaulResponse,
} from "@/lib/backhaul-shared";

function FinderSkeleton() {
  return (
    <div className="backhaul-skeleton" data-backhaul-skeleton="">
      <p className="backhaul-searching">{BACKHAUL_SEARCHING}</p>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="backhaul-skeleton-row" />
      ))}
    </div>
  );
}

function LoadRow({ row }: { row: BackhaulLoadRow }) {
  return (
    <>
      <td>
        <Link href={`/loads/${row.id}`} className="desk-link font-mono">
          {row.loadNumber}
        </Link>
      </td>
      <td>{row.customer}</td>
      <td>
        <div className="backhaul-lane">
          <span>{row.pickup}</span>
          <span className="backhaul-muted">{row.delivery}</span>
        </div>
      </td>
      <td className="backhaul-num backhaul-nearest">{row.miles} mi</td>
      <td>{row.date}</td>
    </>
  );
}

function LoadCard({ row }: { row: BackhaulLoadRow }) {
  return (
    <article className="backhaul-card" data-backhaul-card="">
      <Link href={`/loads/${row.id}`} className="desk-link font-mono">
        {row.loadNumber}
      </Link>
      <div className="backhaul-card-customer">{row.customer}</div>
      <div className="backhaul-lane">
        <span>{row.pickup}</span>
        <span className="backhaul-muted">{row.delivery}</span>
      </div>
      <div className="backhaul-card-meta">
        <span className="backhaul-nearest">{row.miles} mi</span>
        <span>{row.date}</span>
      </div>
    </article>
  );
}

function FinderBody({
  data,
  loadId,
  onRetry,
}: {
  data: BackhaulResponse;
  loadId: number;
  onRetry: () => void;
}) {
  if (!data.ok) {
    const title = data.reason === "missing_delivery" ? BACKHAUL_MISSING_TITLE : BACKHAUL_SEARCH_FAILED;
    return (
      <div className="backhaul-empty" data-backhaul-state={data.reason}>
        <p className="backhaul-empty-title">{title}</p>
        {data.detail ? <p className="backhaul-empty-detail">{data.detail}</p> : null}
        {data.reason === "missing_delivery" ? (
          <Link href={`/loads/${loadId}`} className="btn btn-secondary mt-3">
            Open load
          </Link>
        ) : (
          <button type="button" className="btn btn-secondary mt-3" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (data.loads.length === 0) {
    return (
      <div className="backhaul-empty" data-backhaul-state="empty">
        <p className="backhaul-empty-title">{BACKHAUL_EMPTY_TITLE}</p>
        <p className="backhaul-empty-detail">{backhaulEmptyDetail(data.center.label)}</p>
      </div>
    );
  }
  return (
    <>
      <section className="backhaul-section" data-backhaul-loads="">
        <h3 className="backhaul-section-title">Loads near delivery</h3>
        {data.total > data.loads.length ? (
          <p className="backhaul-cap">
            Showing {data.loads.length} of {data.total}
          </p>
        ) : null}
        <table className="backhaul-table backhaul-table-desktop">
          <thead>
            <tr>
              <th>Load</th>
              <th>Customer</th>
              <th>PU / Del</th>
              <th className="backhaul-num">Mi</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.loads.map((row) => (
              <tr key={row.id}>
                <LoadRow row={row} />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="backhaul-cards">
          {data.loads.map((row) => (
            <LoadCard key={row.id} row={row} />
          ))}
        </div>
      </section>
      <section className="backhaul-section" data-backhaul-customers="">
        <h3 className="backhaul-section-title">Customers in radius</h3>
        <table className="backhaul-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th className="backhaul-num">Loads</th>
              <th>Last</th>
              <th className="backhaul-num">Nearest</th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="backhaul-num">{row.loads}</td>
                <td>{row.last}</td>
                <td className="backhaul-num backhaul-nearest">{row.nearestMi} mi</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function BackhaulFinderPanel({
  loadId,
  open,
  onClose,
}: {
  loadId: number;
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BackhaulResponse | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  useDismissable(open, onClose, panelRef);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/loads/${loadId}/backhaul`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as BackhaulResponse;
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            ok: false,
            reason: "error",
            error: BACKHAUL_SEARCH_FAILED,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadId, retryTick]);

  if (!mounted || !open) return null;

  const sourceNumber = data && "source" in data && data.source ? data.source.loadNumber : "";
  const subtitle =
    data && data.ok
      ? `${data.radiusMi} mi from ${data.center.label}`
      : `${BACKHAUL_RADIUS_MI} mi from delivery`;

  return createPortal(
    <div className="backhaul-backdrop" data-backhaul-finder="" role="presentation">
      <div
        ref={panelRef}
        className="backhaul-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backhaul-finder-title"
      >
        <div className="backhaul-grab" aria-hidden="true" />
        <header className="backhaul-header">
          <div className="min-w-0">
            <h2 id="backhaul-finder-title" className="backhaul-title">
              Backhaul Finder
            </h2>
            <p className="backhaul-sub">{subtitle}</p>
            {sourceNumber ? (
              <Link href={`/loads/${loadId}`} className="desk-link backhaul-source font-mono">
                {sourceNumber}
              </Link>
            ) : null}
          </div>
          <button type="button" className="backhaul-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="backhaul-body">
          {loading || !data ? (
            <FinderSkeleton />
          ) : (
            <FinderBody data={data} loadId={loadId} onRetry={() => setRetryTick((tick) => tick + 1)} />
          )}
        </div>
        <p className="backhaul-footnote">M&S Loads house accounts excluded. Radius fixed at {BACKHAUL_RADIUS_MI} mi.</p>
      </div>
    </div>,
    document.body,
  );
}

export function BackhaulFinderHost({
  loadId,
  children,
}: {
  loadId: number;
  children: (openFinder: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openFinder = useCallback(() => setOpen(true), []);
  return (
    <>
      {children(openFinder)}
      <BackhaulFinderPanel loadId={loadId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
