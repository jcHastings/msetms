import { formatMdYDisplay } from "@/lib/format";
import { formatStatementMoney, type SettlementStatement } from "@/lib/settlement-statement";
import type { ReactNode } from "react";

function percentLabel(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function milesLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function SettlementDocument({
  statement,
  variant,
  deductionEditor,
  removeOneOff,
}: {
  statement: SettlementStatement;
  variant: "office" | "driver";
  deductionEditor?: ReactNode;
  removeOneOff?: (id: number) => ReactNode;
}) {
  const showPercent = statement.driverKind === "owner_operator";
  const sheetClass = variant === "driver" ? "statement-sheet driver-sheet" : "statement-sheet card";
  return (
    <article className={sheetClass} data-settlement-statement="" aria-labelledby="statement-title">
      <header className="statement-header">
        <p className="statement-kicker">Settlement statement</p>
        <dl className="statement-meta">
          <div>
            <dt>Statement</dt>
            <dd>{statement.statementNumber}</dd>
          </div>
          <div>
            <dt>Week</dt>
            <dd>
              {formatMdYDisplay(statement.weekStart)} – {formatMdYDisplay(statement.weekEnd)}
            </dd>
          </div>
          <div>
            <dt>Paid record</dt>
            <dd>{statement.paidAt ? formatMdYDisplay(statement.paidAt) : "Not marked paid"}</dd>
          </div>
        </dl>
        <div>
          {statement.identityBlock ? (
            <p
              id="statement-title"
              role="alert"
              data-statement-identity-block=""
              className="statement-carrier rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-base font-semibold text-amber-950"
            >
              {statement.identityBlock}
            </p>
          ) : (
            <>
              <h2 id="statement-title" className="statement-carrier">
                {statement.carrierName || "Carrier"}
              </h2>
              {statement.carrierAddress ? <p className="statement-address">{statement.carrierAddress}</p> : null}
              <p className="statement-authority">{statement.usdot ? `USDOT ${statement.usdot}` : "USDOT Not on file"}</p>
              <p className="statement-authority">{statement.mcNumber ? `MC ${statement.mcNumber}` : "MC Not on file"}</p>
              {statement.carrierPhone ? <p className="statement-authority">{statement.carrierPhone}</p> : null}
              {statement.carrierEmail ? <p className="statement-authority">{statement.carrierEmail}</p> : null}
            </>
          )}
        </div>
      </header>

      <section className="statement-who" aria-label="Driver">
        <h3 className="statement-driver">{statement.driverName}</h3>
        <p>{statement.driverKindLabel}</p>
        {statement.ownerOperatorCompany ? <p>{statement.ownerOperatorCompany}</p> : null}
      </section>

      <section aria-labelledby="statement-loads">
        <h3 id="statement-loads">Loads</h3>
        {statement.loads.length === 0 ? (
          <p className="statement-empty">No loads in this week.</p>
        ) : (
          <>
          <ul className="statement-loads-cards">
            {statement.loads.map((line) => (
              <li key={line.loadId} className="statement-load-card">
                <p className="statement-load-id">{line.loadNumber}</p>
                <p className="statement-load-lane">{line.lane}</p>
                <dl>
                  <div>
                    <dt>Dates</dt>
                    <dd>
                      {formatMdYDisplay(line.pickup)} – {formatMdYDisplay(line.delivery)}
                    </dd>
                  </div>
                  <div>
                    <dt>Miles</dt>
                    <dd>{milesLabel(line.miles)}</dd>
                  </div>
                  <div>
                    <dt>Linehaul</dt>
                    <dd>
                      {line.linehaul == null ? "—" : formatStatementMoney(line.linehaul)}
                      <span className="statement-basis">{line.basis}</span>
                    </dd>
                  </div>
                  {showPercent ? (
                    <div>
                      <dt>OO %</dt>
                      <dd>{percentLabel(line.ooPercent)}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
          <div className="statement-table-wrap statement-loads-table">
            <table className="statement-table">
              <thead>
                <tr>
                  <th scope="col">Load</th>
                  <th scope="col">Pickup → delivery</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Miles</th>
                  <th scope="col">Linehaul</th>
                  {showPercent ? <th scope="col">OO %</th> : null}
                </tr>
              </thead>
              <tbody>
                {statement.loads.map((line) => (
                  <tr key={line.loadId}>
                    <th scope="row">{line.loadNumber}</th>
                    <td>{line.lane}</td>
                    <td>
                      {formatMdYDisplay(line.pickup)} – {formatMdYDisplay(line.delivery)}
                    </td>
                    <td>{milesLabel(line.miles)}</td>
                    <td>
                      {line.linehaul == null ? "—" : formatStatementMoney(line.linehaul)}
                      <span className="statement-basis">{line.basis}</span>
                    </td>
                    {showPercent ? <td>{percentLabel(line.ooPercent)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section aria-labelledby="statement-extra">
        <h3 id="statement-extra">Extra pay</h3>
        {statement.extras.length === 0 ? (
          <p className="statement-empty">No extra pay stored for this week.</p>
        ) : (
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th scope="col">Load</th>
                  <th scope="col">Item</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.extras.map((line) => (
                  <tr key={line.id}>
                    <td>{line.loadNumber}</td>
                    <td>{line.label}</td>
                    <td>{formatStatementMoney(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="statement-reimburse">
        <h3 id="statement-reimburse">Reimbursements</h3>
        <p className="statement-note">Added to net. Not a deduction.</p>
        {statement.reimbursements.length === 0 ? (
          <p className="statement-empty">No approved reimbursements this week.</p>
        ) : (
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Load</th>
                  <th scope="col">Status</th>
                  <th scope="col">Receipt</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.reimbursements.map((line) => (
                  <tr key={line.id} data-reimbursement-line="">
                    <td>{line.categoryLabel}</td>
                    <td>{line.loadNumber || "—"}</td>
                    <td>{line.status === "paid" ? "Paid" : "Approved"}</td>
                    <td>
                      <a href={line.receiptHref}>Receipt</a>
                    </td>
                    <td>{formatStatementMoney(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="statement-deductions">
        <h3 id="statement-deductions">Deductions</h3>
        {statement.deductions.length === 0 ? (
          <p className="statement-empty">No deductions on this statement.</p>
        ) : (
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">How it applies</th>
                  <th scope="col">Amount</th>
                  {variant === "office" ? <th scope="col" className="no-print"> </th> : null}
                </tr>
              </thead>
              <tbody>
                {statement.deductions.map((line) => (
                  <tr key={line.key}>
                    <td>{line.name}</td>
                    <td>{line.detail}</td>
                    <td>{formatStatementMoney(line.amount)}</td>
                    {variant === "office" ? (
                      <td className="no-print">{line.oneOffId && removeOneOff ? removeOneOff(line.oneOffId) : null}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {deductionEditor}
      </section>

      <section className="statement-totals" aria-label="Totals">
        <div>
          <span>Gross</span>
          <strong>{formatStatementMoney(statement.gross)}</strong>
        </div>
        <div>
          <span>Reimbursements</span>
          <strong data-reimbursement-total="">{formatStatementMoney(statement.reimbursementTotal)}</strong>
        </div>
        <div>
          <span>Total deductions</span>
          <strong>{formatStatementMoney(statement.deductionTotal)}</strong>
        </div>
        <div className="statement-net">
          <span>Net</span>
          <strong data-settlement-net="">{formatStatementMoney(statement.net)}</strong>
        </div>
      </section>
      <p className="statement-footnote">
        Tax is not calculated on this statement. This page does not move money or send a copy to the driver.
      </p>
    </article>
  );
}
