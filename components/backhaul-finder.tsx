"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "@/components/use-dismissable";
import { BACKHAUL_RADIUS_MI, type BackhaulResponse } from "@/lib/backhaul-shared";

function FinderSkeleton() {
  return (
    <div className="backhaul-skeleton" data-backhaul-skeleton="">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="backhaul-skeleton-row" />
      ))}
    </div>
  );
}

function FinderBody({ data }: { data: BackhaulResponse }) {
  if (!data.ok) {
    return (
      <p className="backhaul-empty" data-backhaul-state={data.reason}>
        {data.error}
      </p>
    );
  }
  if (data.loads.length === 0) {
    return (
      <p className="backhaul-empty" data-backhaul-state="empty">
        No loads within {data.radiusMi} mi of {data.center.label}.
      </p>
    );
  }
  return (
    <>
      <section className="backhaul-section" data-backhaul-loads="">
        <h3 className="backhaul-section-title">Loads near delivery</h3>
        <table className="backhaul-table">
          <thead>
            <tr>
              <th>Load#</th>
              <th>Customer</th>
              <th>Pickup</th>
              <th>Delivery</th>
              <th className="backhaul-num">Mi</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.loads.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/loads/${row.id}`} className="desk-link font-mono">
                    {row.loadNumber}
                  </Link>
                </td>
                <td>{row.customer}</td>
                <td>{row.pickup}</td>
                <td className="backhaul-muted">{row.delivery}</td>
                <td className="backhaul-num">{row.miles}</td>
                <td>{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            error: "Backhaul Finder could not search right now.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadId]);

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
          {loading || !data ? <FinderSkeleton /> : <FinderBody data={data} />}
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
