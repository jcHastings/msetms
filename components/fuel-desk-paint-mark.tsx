"use client";

import { useEffect } from "react";

/** Marks first paint so a Fuel nav click can be measured in the browser timeline. */
export function FuelDeskPaintMark({
  panel,
  heavyMounted,
}: {
  panel: string;
  heavyMounted: boolean;
}) {
  useEffect(() => {
    const detail = { panel, heavyMounted };
    performance.mark("fuel-desk-paint", { detail });
    const clicks = performance.getEntriesByName("fuel-nav-click");
    const click = clicks[clicks.length - 1];
    if (click) {
      performance.measure("fuel-desk-nav", {
        start: click.startTime,
        duration: Math.max(0, performance.now() - click.startTime),
        detail,
      });
    }
  }, [panel, heavyMounted]);

  return (
    <p className="sr-only" data-fuel-desk-paint={panel} data-fuel-heavy-mounted={heavyMounted ? "yes" : "no"}>
      Fuel {panel} ready
    </p>
  );
}
