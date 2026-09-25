import { performance } from "node:perf_hooks";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fuelDeskMounts, resolveFuelDeskPanel } from "../lib/fuel-desk";

function fuelRows(count: number) {
  return createElement(
    "table",
    null,
    createElement(
      "tbody",
      null,
      Array.from({ length: count }, (_, index) =>
        createElement(
          "tr",
          { key: index },
          createElement("td", null, `2026-09-25 08:${String(index % 60).padStart(2, "0")}`),
          createElement("td", null, `Driver ${index}`),
          createElement("td", null, `Unit ${index % 40}`),
          createElement("td", null, "Pilot, Omaha NE"),
          createElement("td", null, (80 + (index % 20)).toFixed(1)),
          createElement("td", null, `$${(300 + index).toFixed(2)}`),
          createElement(
            "select",
            null,
            Array.from({ length: 12 }, (_, option) => createElement("option", { key: option }, `Driver ${option}`)),
          ),
        ),
      ),
    ),
  );
}

function timeRows(count: number) {
  const start = performance.now();
  const html = renderToStaticMarkup(fuelRows(count));
  return { rows: count, ms: performance.now() - start, bytes: html.length };
}

export function fuelNavPaintBench() {
  const spend = fuelDeskMounts("spend");
  const heavyMountedOnSpend =
    spend.closeout || spend.mpg || spend.receipts || spend.audit || spend.transactions;
  const light = timeRows(25);
  const heavy = timeRows(2000);
  const ok =
    resolveFuelDeskPanel({}) === "spend" &&
    spend.spend &&
    spend.import &&
    !heavyMountedOnSpend &&
    light.bytes * 20 < heavy.bytes;
  return { ok, spend, heavyMountedOnSpend, light, heavy };
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("fuel-nav-paint-bench.ts") || entry.endsWith("fuel-nav-paint-bench.js")) {
  const result = fuelNavPaintBench();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
