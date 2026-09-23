import { PageHeader } from "@/components/page-header";
import {
  formatDeskCpm,
  formatDeskMiles,
  formatDeskMoney,
  formatDeskPct,
  MONEY_ASKS,
  moneyDeskHref,
  moneySpanHref,
  type MoneyDeskModel,
  type MoneySpan,
  type MoneyStandingRow,
} from "@/lib/money-desk";

const SPANS: Array<{ id: MoneySpan; label: string }> = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
];

function moneyClass(value: number | null): string {
  return value != null && value < 0 ? "money-num money-neg" : "money-num";
}

function StandingRow({ row }: { row: MoneyStandingRow }) {
  return (
    <tr data-money-truck={row.truckId} data-money-active={row.active ? "1" : "0"}>
      <th scope="row">
        {row.unit}
        {row.active ? null : <span className="money-tag">Inactive</span>}
      </th>
      <td>{row.driverName}</td>
      <td className="money-num">{formatDeskMiles(row.miles)}</td>
      <td className="money-num">{formatDeskMoney(row.fuel)}</td>
      <td className="money-num">{formatDeskMoney(row.tolls)}</td>
      <td className="money-num">{formatDeskMoney(row.other)}</td>
      <td className="money-num">{formatDeskMoney(row.burns)}</td>
      <td className="money-num">{formatDeskCpm(row.cpm)}</td>
      <td className="money-num">{formatDeskMoney(row.revenue)}</td>
      <td className={moneyClass(row.margin)}>{formatDeskMoney(row.margin)}</td>
      <td className={moneyClass(row.marginPct)}>{formatDeskPct(row.marginPct)}</td>
    </tr>
  );
}

export function MoneyDeskView({ model }: { model: MoneyDeskModel }) {
  const { standings, window } = model;
  const fleet = standings.fleet;
  const periodHref = (q?: string) =>
    moneyDeskHref({ span: window.span, anchorYmd: window.anchorYmd, inactive: model.includeInactive, q });

  return (
    <main id="main" className="money-desk" data-money-desk="" data-money-span={window.span}>
      <a className="money-skip" href="#money-standings">
        Skip to standings
      </a>
      <PageHeader
        dense
        title="Money"
        subtitle="Cost per mile and contribution for the fleet. Soft flags only. Nothing is sent or paid here."
      />
      <nav className="money-jumps" aria-label="Money sections">
        <a href="#money-standings">Standings</a>
        <a href="#money-flags">Flags</a>
        <a href="#money-cash">Cash sketch</a>
        <a href="#money-ask">Ask</a>
      </nav>

      <div className="money-toolbar">
        <div className="money-spans" role="group" aria-label="Period">
          {SPANS.map((span) => {
            const on = window.span === span.id;
            return (
              <a
                key={span.id}
                href={moneySpanHref(span.id, model.includeInactive)}
                className={on ? "money-span money-span-on" : "money-span"}
                aria-current={on ? "page" : undefined}
              >
                {span.label}
              </a>
            );
          })}
        </div>
        <form action="/money" method="get" className="money-period-form">
          {window.span !== "week" ? <input type="hidden" name="span" value={window.span} /> : null}
          {model.includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}
          {window.span === "week" ? (
            <div className="field">
              <label htmlFor="money-week">Week</label>
              <select id="money-week" name="week" defaultValue={window.anchorYmd}>
                {model.weekChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {window.span === "month" ? (
            <div className="field">
              <label htmlFor="money-month">Month</label>
              <select id="money-month" name="month" defaultValue={window.anchorYmd}>
                {model.monthChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {window.span === "quarter" ? (
            <div className="field">
              <label htmlFor="money-quarter">Quarter</label>
              <select id="money-quarter" name="quarter" defaultValue={window.anchorYmd}>
                {model.quarterChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary">
            Open
          </button>
        </form>
      </div>

      <section id="money-standings" aria-labelledby="money-standings-heading" data-money-standings="">
        <header className="money-section-head">
          <h2 id="money-standings-heading">Standings</h2>
          <p>{window.label}. Active trucks{model.includeInactive ? " and inactive trucks" : ""}.</p>
        </header>
        <dl className="money-stats">
          <div>
            <dt>Fleet CPM</dt>
            <dd data-money-fleet-cpm="">{formatDeskCpm(fleet.cpm)}</dd>
          </div>
          <div>
            <dt>Contribution</dt>
            <dd className={fleet.margin != null && fleet.margin < 0 ? "money-neg" : undefined}>{formatDeskMoney(fleet.margin)}</dd>
          </div>
          <div>
            <dt>Contribution %</dt>
            <dd>{formatDeskPct(fleet.marginPct)}</dd>
          </div>
          <div>
            <dt>Samsara miles</dt>
            <dd>{formatDeskMiles(fleet.miles)}</dd>
          </div>
          <div>
            <dt>Burns</dt>
            <dd>{formatDeskMoney(fleet.burns)}</dd>
          </div>
        </dl>
        <p className="money-note">
          CPM is fuel, tolls, money codes, and lumper divided by Samsara miles. Contribution is load revenue on the
          truck minus those burns. Other is money codes plus lumper.
        </p>
        {standings.milesNote ? <p className="money-note">{standings.milesNote}</p> : null}
        {model.fuelNote ? <p className="money-note">{model.fuelNote}</p> : null}
        {model.tollsNote ? <p className="money-note">{model.tollsNote}</p> : null}
        {standings.unassignedFuel > 0 || standings.unassignedTolls > 0 ? (
          <p className="money-note">
            Unassigned fuel {formatDeskMoney(standings.unassignedFuel)} and unassigned tolls{" "}
            {formatDeskMoney(standings.unassignedTolls)} are not in CPM.
          </p>
        ) : null}
        {standings.hiddenInactiveBurns > 0 ? (
          <p className="money-note">
            Inactive trucks are hidden. Their burns ({formatDeskMoney(standings.hiddenInactiveBurns)}) are not in fleet
            CPM.
          </p>
        ) : null}
        {standings.loadsWithoutTruck > 0 ? (
          <p className="money-note">
            {standings.loadsWithoutTruck} load{standings.loadsWithoutTruck === 1 ? "" : "s"} in this period have revenue
            and no truck, so they are left out of contribution.
          </p>
        ) : null}
        <form action="/money" method="get" className="money-inactive">
          {window.span !== "week" ? <input type="hidden" name="span" value={window.span} /> : null}
          {window.span === "week" ? <input type="hidden" name="week" value={window.anchorYmd} /> : null}
          {window.span === "month" ? <input type="hidden" name="month" value={window.anchorYmd} /> : null}
          {window.span === "quarter" ? <input type="hidden" name="quarter" value={window.anchorYmd} /> : null}
          <label htmlFor="money-inactive">
            <input
              id="money-inactive"
              className="money-check"
              type="checkbox"
              name="inactive"
              value="1"
              defaultChecked={model.includeInactive}
            />
            Include inactive trucks
          </label>
          <button type="submit" className="btn btn-secondary">
            Apply
          </button>
        </form>
        {standings.rows.length === 0 ? (
          <p className="money-empty">No active trucks in this view.</p>
        ) : (
          <div className="money-scroll">
            <table className="table-grid money-table">
              <caption className="sr-only">Cost per mile and contribution by truck for {window.label}</caption>
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Miles</th>
                  <th scope="col">Fuel</th>
                  <th scope="col">Tolls</th>
                  <th scope="col">Other</th>
                  <th scope="col">Burns</th>
                  <th scope="col">CPM</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Contribution</th>
                  <th scope="col">%</th>
                </tr>
              </thead>
              <tbody>
                {standings.rows.map((row) => (
                  <StandingRow key={row.truckId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="money-flags" aria-labelledby="money-flags-heading" data-money-flags="">
        <header className="money-section-head">
          <h2 id="money-flags-heading">Flags</h2>
          <p>Soft flags for {window.label}. Nothing is texted to a driver.</p>
        </header>
        {model.flags.length === 0 ? (
          <p className="money-empty">No flags in this period.</p>
        ) : (
          <div className="money-scroll">
            <table className="table-grid money-table">
              <caption className="sr-only">Money flags with evidence links</caption>
              <thead>
                <tr>
                  <th scope="col">Flag</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {model.flags.map((flag) => (
                  <tr key={flag.id} data-money-flag={flag.kind}>
                    <th scope="row">{flag.title}</th>
                    <td>{flag.detail}</td>
                    <td>
                      {flag.href && flag.hrefLabel ? (
                        <a className="money-link" href={flag.href}>
                          {flag.hrefLabel}
                        </a>
                      ) : (
                        "n/a"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="money-cash" aria-labelledby="money-cash-heading" data-money-cash="" data-cash-sketch="not-bank-backed">
        <header className="money-section-head">
          <h2 id="money-cash-heading">
            13-week cash sketch <span className="money-badge">SKETCH. Not bank-backed.</span>
          </h2>
          <p>Next 13 office weeks, starting this Monday. It does not follow the standings period.</p>
        </header>
        <p className="money-banner" role="note">
          {model.cash.banner}
        </p>
        {model.cash.notes.map((note) => (
          <p key={note} className="money-note">
            {note}
          </p>
        ))}
        <div className="money-scroll">
          <table className="table-grid money-table">
            <caption className="sr-only">13-week cash sketch, not a bank balance</caption>
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Invoiced</th>
                <th scope="col">Expected</th>
                <th scope="col">Fuel</th>
                <th scope="col">Tolls</th>
                <th scope="col">Sketch net</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {model.cash.weeks.map((week) => (
                <tr key={week.startYmd} data-cash-week={week.startYmd} data-cash-status={week.status}>
                  <th scope="row">{week.label}</th>
                  <td className="money-num">{week.receivableCount ? formatDeskMoney(week.invoiced) : "n/a"}</td>
                  <td className="money-num">{week.receivableCount ? formatDeskMoney(week.expected) : "n/a"}</td>
                  <td className="money-num">{week.burnCount ? formatDeskMoney(week.fuel) : "n/a"}</td>
                  <td className="money-num">{week.burnCount ? formatDeskMoney(week.tolls) : "n/a"}</td>
                  <td className={moneyClass(week.net)}>
                    {week.status === "gap" ? "Gap" : week.status === "partial" ? "Incomplete" : formatDeskMoney(week.net)}
                  </td>
                  <td>{week.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="money-ask" aria-labelledby="money-ask-heading" data-money-ask="">
        <header className="money-section-head">
          <h2 id="money-ask-heading">Ask</h2>
          <p>Answers use live TMS numbers only. If a number is missing, the answer says so.</p>
        </header>
        <div className="money-ask-prompts">
          {MONEY_ASKS.map((item) => (
            <a key={item.id} className="btn btn-secondary" href={periodHref(item.question)}>
              {item.label}
            </a>
          ))}
        </div>
        <form action="/money" method="get" className="money-ask-form">
          {window.span !== "week" ? <input type="hidden" name="span" value={window.span} /> : null}
          {window.span === "week" ? <input type="hidden" name="week" value={window.anchorYmd} /> : null}
          {window.span === "month" ? <input type="hidden" name="month" value={window.anchorYmd} /> : null}
          {window.span === "quarter" ? <input type="hidden" name="quarter" value={window.anchorYmd} /> : null}
          {model.includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}
          <div className="field money-ask-field">
            <label htmlFor="money-q">Question</label>
            <input id="money-q" name="q" type="text" defaultValue={model.ask?.question ?? ""} maxLength={240} />
          </div>
          <button type="submit" className="btn btn-primary">
            Answer
          </button>
        </form>
        {model.ask ? (
          <div className="money-answer" role="status" data-money-answer={model.ask.matched ? "grounded" : "missing"}>
            <p className="money-answer-q">{model.ask.question}</p>
            <p>{model.ask.answer}</p>
          </div>
        ) : (
          <p className="money-empty">Pick a question, or type one of those three.</p>
        )}
      </section>
    </main>
  );
}
