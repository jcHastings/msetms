"use client";

import { useState } from "react";
import Link from "next/link";
import {
  markAllOfficeNotificationsReadAction,
  markOfficeNotificationReadAction,
} from "@/lib/settings-actions";
import type { OfficeNotification } from "@/lib/alert-rules-shared";

export function OfficeNotificationBell({ items }: { items: OfficeNotification[] }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !item.read_at.trim()).length;
  return (
    <div className="office-bell">
      <button
        type="button"
        className="office-bell-button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Alerts{unread > 0 ? ` (${unread})` : ""}
      </button>
      {open ? (
        <div className="office-bell-panel">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Office alerts
            </span>
            {unread > 0 ? (
              <form action={markAllOfficeNotificationsReadAction}>
                <button className="acct-link" type="submit">
                  Mark all read
                </button>
              </form>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-slate-400">No alerts yet.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className={item.read_at.trim() ? "opacity-70" : ""}>
                  <form action={markOfficeNotificationReadAction}>
                    <input type="hidden" name="notification_id" value={item.id} />
                    <button className="block w-full text-left" type="submit">
                      <div className="text-xs font-semibold text-slate-800">{item.title}</div>
                      <div className="whitespace-pre-wrap text-[11px] leading-snug text-slate-600">
                        {item.body}
                      </div>
                    </button>
                  </form>
                  {item.href ? (
                    <Link href={item.href} className="acct-link text-[11px]" onClick={() => setOpen(false)}>
                      Open
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
