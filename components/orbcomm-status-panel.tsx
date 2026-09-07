"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrailerShareLinkPanel } from "@/components/trailer-share-link";
import { formatDateTime, shortPlaceLabel } from "@/lib/format";
import type { FleetStatusRow } from "@/lib/fleet-map-shared";

const PHONE_STATUS_QUERY = "(max-width: 47.99rem)";

function messageTime(iso: string | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const shown = formatDateTime(raw);
  return shown === "—" ? "" : shown;
}

export function statusPlace(location: string | undefined): string {
  return shortPlaceLabel(location ?? "") || location || "—";
}

function OrbcommShare({ row }: { row: FleetStatusRow }) {
  if (!row.trailerId) return null;
  return (
    <TrailerShareLinkPanel
      trailerId={row.trailerId}
      sharePath={row.sharePath}
      expiresAt={row.shareExpiresAt}
      compact
    />
  );
}

function OrbcommStatusCards({ rows }: { rows: FleetStatusRow[] }) {
  return (
    <ul className="orbcomm-status-cards" data-orbcomm-status-cards="">
      {rows.map((row) => (
        <li key={`card-${row.id}`} className="orbcomm-status-card" data-orbcomm-status-card="">
          <div className="orbcomm-status-card-head">
            <Link href={row.href} className="font-semibold underline" data-orbcomm-trailer="">
              {row.trailer}
            </Link>
            {row.alarm ? (
              <span className="orbcomm-status-card-alarm" data-orbcomm-alarm="">
                {row.alarm}
              </span>
            ) : null}
          </div>
          <div className="orbcomm-status-card-location" data-orbcomm-location="">
            {statusPlace(row.location)}
          </div>
          <dl className="orbcomm-status-card-meta">
            <div>
              <dt>Temp °F</dt>
              <dd className="orbcomm-status-card-temp" data-orbcomm-temp="">
                {row.temperatureF == null ? "—" : `${row.temperatureF}`}
              </dd>
            </div>
            <div>
              <dt>Power</dt>
              <dd>{row.power}</dd>
            </div>
            <div>
              <dt>Setpoint °F</dt>
              <dd>{row.setpointF == null ? "—" : `${row.setpointF}`}</dd>
            </div>
            <div>
              <dt>Message</dt>
              <dd data-orbcomm-message="">{messageTime(row.messageAt)}</dd>
            </div>
          </dl>
          <div className="trailer-share-compact-cell">
            <OrbcommShare row={row} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function OrbcommStatusTable({ rows }: { rows: FleetStatusRow[] }) {
  return (
    <div className="orbcomm-status-scroll" data-orbcomm-status-scroll="">
      <table className="table-grid">
        <thead>
          <tr>
            <th>Trailer</th>
            <th>Power</th>
            <th>Setpoint °F</th>
            <th>Temp °F</th>
            <th>Alarm</th>
            <th>Location</th>
            <th>Message</th>
            <th>Customer link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={row.href} className="font-semibold underline">
                  {row.trailer}
                </Link>
              </td>
              <td>{row.power}</td>
              <td>{row.setpointF == null ? "—" : `${row.setpointF}`}</td>
              <td className="orbcomm-temp-cell" data-orbcomm-temp="">
                {row.temperatureF == null ? "—" : `${row.temperatureF}`}
              </td>
              <td className={row.alarm ? "font-semibold text-rose-700" : undefined}>{row.alarm || "—"}</td>
              <td className="orbcomm-location-cell" data-orbcomm-location="">
                {statusPlace(row.location)}
              </td>
              <td data-orbcomm-message="">{messageTime(row.messageAt)}</td>
              <td className="trailer-share-compact-cell">
                <OrbcommShare row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrbcommStatusPanel({ rows }: { rows: FleetStatusRow[] }) {
  const [phone, setPhone] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(PHONE_STATUS_QUERY);
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <section
      className="card mt-4"
      data-orbcomm-status-table=""
      data-orbcomm-phone-cards={phone ? "" : undefined}
    >
      {phone ? <OrbcommStatusCards rows={rows} /> : <OrbcommStatusTable rows={rows} />}
    </section>
  );
}
