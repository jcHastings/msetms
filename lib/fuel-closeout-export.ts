import { formatFuelMoney, formatGallons, formatMdYDisplay } from "./format";
import type { FuelCloseoutDriverRow, FuelCloseoutRank, FuelCloseoutReport } from "./fuel-closeout";

function n(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function miles(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${n(value, 0)} mi`;
}

function mpg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return n(value, 1);
}

function money(value: number | null | undefined): string {
  return formatFuelMoney(value);
}

function gal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "-";
  return formatGallons(value);
}

function flagLabel(row: FuelCloseoutDriverRow): string {
  if (!row.flags.length) return "none";
  return row.flags
    .map((flag) => `${flag.severity === "high" ? "red" : "yellow"} ${flag.kind.replace("_", " ")} ${flag.product}`)
    .join("; ");
}

function rankLine(row: FuelCloseoutRank): string {
  return `${row.driverName}${row.unit ? ` · ${row.unit}` : ""} ${mpg(row.mpg)} MPG (${miles(row.miles)} / ${gal(row.dieselGallons)})`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderFuelCloseoutMarkdown(report: FuelCloseoutReport): string {
  const spend = report.fleet.spend;
  const lines = [
    `# Weekly fuel closeout`,
    ``,
    `${report.week.label}`,
    ``,
    report.note,
    ``,
    `Miles source: ${report.milesSource.label} (${report.milesSource.status}). ${report.milesSource.note}`,
    ``,
    `## Fleet`,
    ``,
    `- Miles: ${miles(report.fleet.miles)}`,
    `- Truck diesel: ${gal(report.fleet.dieselGallons)} / ${money(report.fleet.dieselAmount)}`,
    `- Fleet MPG: ${mpg(report.fleet.mpg)}`,
    `- vs prior week MPG: ${report.fleet.mpgVsPrior == null ? "-" : `${n(report.fleet.mpgVsPrior, 1)} (prior ${mpg(report.fleet.priorMpg)})`}`,
    `- Fills: ${report.fleet.fillCount}`,
    `- Unassigned fuel $: ${money(report.fleet.unassignedAmount)}`,
    ``,
    `### Week spend`,
    ``,
    `- Fuel: ${money(spend.fuel)}`,
    `- Reefer: ${money(spend.reefer)}`,
    `- Scale: ${money(spend.scale)}`,
    `- DEF: ${money(spend.def)}`,
    `- Money code: ${money(spend.money)}`,
    ``,
    `### Worst 3 MPG`,
    ``,
    ...(report.fleet.worst3.length ? report.fleet.worst3.map((row) => `- ${rankLine(row)}`) : ["- None with MPG"]),
    ``,
    `### Best 3 MPG`,
    ``,
    ...(report.fleet.best3.length ? report.fleet.best3.map((row) => `- ${rankLine(row)}`) : ["- None with MPG"]),
    ``,
    `## Green lights`,
    ``,
    ...(report.greenLights.length
      ? report.greenLights.map(
          (row) =>
            `- ${row.driverName}${row.unit ? ` · ${row.unit}` : ""} ${mpg(row.mpg)} MPG, ${row.fillCount} fills`,
        )
      : ["- None"]),
    ``,
    `## Flags`,
    ``,
    ...(report.flags.length
      ? report.flags.map(
          (flag) =>
            `- ${flag.severity === "high" ? "red" : "yellow"} ${flag.driverName}${flag.unit ? ` · ${flag.unit}` : ""} · ${flag.kind.replace("_", " ")} · ${flag.product} · ${flag.metric}. ${flag.why}`,
        )
      : ["- None"]),
    ``,
    `## Extras`,
    ``,
    `- Idle-ish (high diesel / low miles): ${
      report.fleet.idleIsh.length
        ? report.fleet.idleIsh.map((row) => `${row.driverName}${row.unit ? ` · ${row.unit}` : ""} (${row.why})`).join("; ")
        : "none"
    }`,
    `- Fuel, no miles: ${
      report.fleet.fuelNoMiles.length
        ? report.fleet.fuelNoMiles.map((row) => `${row.driverName} ${gal(row.dieselGallons)}`).join("; ")
        : "none"
    }`,
    `- Miles, no fuel: ${
      report.fleet.milesNoFuel.length
        ? report.fleet.milesNoFuel.map((row) => `${row.driverName} ${miles(row.miles)}`).join("; ")
        : "none"
    }`,
    ``,
    `## Per driver`,
    ``,
    `| Driver | Unit | Miles | Diesel g | Diesel $ | MPG | Fills | Avg g/fill | Reefer $ | DEF $ | Scale $ | Money $ | Flags | Green |`,
    `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |`,
    ...report.drivers.map((row) =>
      [
        row.driverName,
        row.unit || "-",
        miles(row.miles),
        n(row.dieselGallons, 1),
        money(row.dieselAmount),
        mpg(row.mpg),
        String(row.fillCount),
        row.avgGallonsPerFill == null ? "-" : n(row.avgGallonsPerFill, 1),
        money(row.reeferAmount),
        money(row.defAmount),
        money(row.scaleAmount),
        money(row.moneyAmount),
        flagLabel(row),
        row.greenLight ? "yes" : "-",
      ].join(" | "),
    ),
    ``,
    `_Filed ${formatMdYDisplay(report.week.startYmd)} to ${formatMdYDisplay(report.week.endYmd)}. Miles are Samsara odometer, not Ascend._`,
    ``,
  ];
  return lines.join("\n");
}

export function renderFuelCloseoutHtml(report: FuelCloseoutReport): string {
  const spend = report.fleet.spend;
  const driverRows = report.drivers
    .map((row) => {
      const tone = row.flags.some((flag) => flag.severity === "high")
        ? "red"
        : row.flags.length
          ? "yellow"
          : row.greenLight
            ? "green"
            : "";
      return `<tr data-closeout-driver="${escapeHtml(row.subjectKey)}" data-tone="${tone}">
  <td>${escapeHtml(row.driverName)}</td>
  <td>${escapeHtml(row.unit || "-")}</td>
  <td>${escapeHtml(miles(row.miles))}</td>
  <td>${escapeHtml(n(row.dieselGallons, 1))}</td>
  <td>${escapeHtml(money(row.dieselAmount))}</td>
  <td>${escapeHtml(mpg(row.mpg))}</td>
  <td>${row.fillCount}</td>
  <td>${escapeHtml(row.avgGallonsPerFill == null ? "-" : n(row.avgGallonsPerFill, 1))}</td>
  <td>${escapeHtml(money(row.reeferAmount))}</td>
  <td>${escapeHtml(money(row.defAmount))}</td>
  <td>${escapeHtml(money(row.scaleAmount))}</td>
  <td>${escapeHtml(money(row.moneyAmount))}</td>
  <td>${escapeHtml(flagLabel(row))}</td>
  <td>${row.greenLight ? "yes" : "-"}</td>
</tr>`;
    })
    .join("\n");
  const list = (items: string[]) =>
    items.length ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>` : "<p>None.</p>";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Weekly fuel closeout ${escapeHtml(report.week.startYmd)}</title>
  <style>
    body { font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; color: #122033; margin: 24px; }
    h1, h2, h3 { font-weight: 650; }
    table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid #d7dee8; padding: 6px 8px; text-align: left; }
    th { font-size: 12px; color: #5b6b7c; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
    .card { border: 1px solid #d7dee8; padding: 10px 12px; }
    .label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #5b6b7c; }
    .value { font-size: 20px; font-weight: 650; }
    tr[data-tone="red"] { background: #fdecec; }
    tr[data-tone="yellow"] { background: #fff6e0; }
    tr[data-tone="green"] { background: #eef7ef; }
    .note { color: #5b6b7c; }
  </style>
</head>
<body>
  <h1>Weekly fuel closeout</h1>
  <p>${escapeHtml(report.week.label)}</p>
  <p class="note">${escapeHtml(report.note)}</p>
  <p>Miles source: ${escapeHtml(report.milesSource.label)} (${escapeHtml(report.milesSource.status)}). ${escapeHtml(report.milesSource.note)}</p>
  <div class="cards">
    <div class="card"><div class="label">Miles</div><div class="value">${escapeHtml(miles(report.fleet.miles))}</div></div>
    <div class="card"><div class="label">Diesel</div><div class="value">${escapeHtml(gal(report.fleet.dieselGallons))}</div></div>
    <div class="card"><div class="label">Diesel $</div><div class="value">${escapeHtml(money(report.fleet.dieselAmount))}</div></div>
    <div class="card"><div class="label">Fleet MPG</div><div class="value">${escapeHtml(mpg(report.fleet.mpg))}</div></div>
    <div class="card"><div class="label">vs prior week</div><div class="value">${escapeHtml(report.fleet.mpgVsPrior == null ? "-" : n(report.fleet.mpgVsPrior, 1))}</div></div>
  </div>
  <h2>Week spend</h2>
  <div class="cards">
    <div class="card"><div class="label">Fuel</div><div class="value">${escapeHtml(money(spend.fuel))}</div></div>
    <div class="card"><div class="label">Reefer</div><div class="value">${escapeHtml(money(spend.reefer))}</div></div>
    <div class="card"><div class="label">Scale</div><div class="value">${escapeHtml(money(spend.scale))}</div></div>
    <div class="card"><div class="label">DEF</div><div class="value">${escapeHtml(money(spend.def))}</div></div>
    <div class="card"><div class="label">Money code</div><div class="value">${escapeHtml(money(spend.money))}</div></div>
  </div>
  <h2>Worst 3 MPG</h2>
  ${list(report.fleet.worst3.map((row) => escapeHtml(rankLine(row))))}
  <h2>Best 3 MPG</h2>
  ${list(report.fleet.best3.map((row) => escapeHtml(rankLine(row))))}
  <h2>Green lights</h2>
  ${list(report.greenLights.map((row) => escapeHtml(`${row.driverName}${row.unit ? ` · ${row.unit}` : ""} ${mpg(row.mpg)} MPG`)))}
  <h2>Flags</h2>
  ${list(report.flags.map((flag) => escapeHtml(`${flag.severity === "high" ? "red" : "yellow"} ${flag.driverName} · ${flag.kind.replace("_", " ")} · ${flag.product} · ${flag.metric}. ${flag.why}`)))}
  <h2>Extras</h2>
  <p>Unassigned fuel $: ${escapeHtml(money(report.fleet.unassignedAmount))}</p>
  ${list([
    `Idle-ish: ${report.fleet.idleIsh.length ? report.fleet.idleIsh.map((row) => `${row.driverName} (${row.why})`).join("; ") : "none"}`,
    `Fuel, no miles: ${report.fleet.fuelNoMiles.length ? report.fleet.fuelNoMiles.map((row) => `${row.driverName} ${gal(row.dieselGallons)}`).join("; ") : "none"}`,
    `Miles, no fuel: ${report.fleet.milesNoFuel.length ? report.fleet.milesNoFuel.map((row) => `${row.driverName} ${miles(row.miles)}`).join("; ") : "none"}`,
  ].map(escapeHtml))}
  <h2>Per driver</h2>
  <table>
    <thead>
      <tr>
        <th>Driver</th><th>Unit</th><th>Miles</th><th>Diesel g</th><th>Diesel $</th><th>MPG</th>
        <th>Fills</th><th>Avg g/fill</th><th>Reefer $</th><th>DEF $</th><th>Scale $</th><th>Money $</th><th>Flags</th><th>Green</th>
      </tr>
    </thead>
    <tbody>
${driverRows}
    </tbody>
  </table>
  <p class="note">Filed ${escapeHtml(formatMdYDisplay(report.week.startYmd))} to ${escapeHtml(formatMdYDisplay(report.week.endYmd))}. Miles are Samsara odometer, not Ascend.</p>
</body>
</html>
`;
}
