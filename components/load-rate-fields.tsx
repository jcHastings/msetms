"use client";

import { useEffect, useRef, useState } from "react";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import { computeOwnerOperatorPay, impliedOwnerOperatorPercent } from "@/lib/settlement";
import type { Load } from "@/lib/types";

/** Customer rate and OO pay — Financials on an existing load, New load on create. */
export function LoadRateFields({
  load,
  defaultsRate = null,
  ooPercent = null,
  onOoPercentChange,
}: {
  load?: Load;
  defaultsRate?: number | null;
  ooPercent?: number | null;
  onOoPercentChange?: (percent: number | null) => void;
}) {
  const { persistFields } = useLoadAssignPersist(load?.id);

  function persistMoney(fields: Record<string, string>) {
    if (!load) return;
    void persistFields(fields);
  }
  const [rate, setRate] = useState(
    load?.rate != null ? String(load.rate) : defaultsRate != null ? String(defaultsRate) : "",
  );
  const [ooPay, setOoPay] = useState(load?.oo_pay != null ? String(load.oo_pay) : "");
  const [percent, setPercent] = useState(
    load?.oo_percent != null ? String(load.oo_percent) : ooPercent != null ? String(ooPercent) : "",
  );
  const lastOoPercent = useRef(ooPercent);
  useEffect(() => {
    if (ooPercent === lastOoPercent.current) return;
    lastOoPercent.current = ooPercent;
    if (ooPercent == null) {
      setPercent("");
      setOoPay("");
      return;
    }
    setPercent(String(ooPercent));
    const pay = computeOwnerOperatorPay(rate === "" ? null : Number(rate), ooPercent);
    setOoPay(pay != null ? String(pay) : "");
  }, [ooPercent, rate]);

  return (
    <>
      <div className="field">
        <label htmlFor="rate">Customer rate</label>
        <input
          id="rate"
          name="rate"
          type="number"
          min={0}
          step="0.01"
          data-critical-save=""
          value={rate}
          onChange={(event) => {
            const next = event.target.value;
            setRate(next);
            if (ooPercent != null) {
              const live = Number(percent);
              const pay = computeOwnerOperatorPay(
                next === "" ? null : Number(next),
                Number.isFinite(live) ? live : ooPercent,
              );
              setOoPay(pay != null ? String(pay) : "");
            }
          }}
          onBlur={() => {
            if (load && String(load.rate ?? "") !== rate) persistMoney({ rate });
          }}
        />
      </div>
      {ooPercent != null ? (
        <div className="field md:col-span-2" data-oo-pay-pair="">
          <div className="mb-1 text-sm font-semibold text-slate-900">OO pay</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field" data-oo-pay="">
              <label htmlFor="oo_pay">Dollars</label>
              <input
                id="oo_pay"
                name="oo_pay"
                type="number"
                min={0}
                step="0.01"
                data-critical-save=""
                value={ooPay}
                onChange={(event) => {
                  const next = event.target.value;
                  setOoPay(next);
                  const livePay = Number(next);
                  const liveRate = Number(rate);
                  const implied = impliedOwnerOperatorPercent(
                    Number.isFinite(livePay) ? livePay : null,
                    Number.isFinite(liveRate) ? liveRate : null,
                  );
                  if (implied != null) {
                    setPercent(String(implied));
                    onOoPercentChange?.(implied);
                  }
                }}
                onBlur={() => {
                  if (!load || String(load.oo_pay ?? "") === ooPay) return;
                  persistMoney({
                    oo_pay: ooPay,
                    ...(percent ? { oo_percent: percent } : {}),
                  });
                }}
              />
            </div>
            <div className="field" data-oo-percent="">
              <label htmlFor="oo_percent">Percent of flat rate</label>
              <input
                id="oo_percent"
                name="oo_percent"
                type="number"
                min={0}
                max={100}
                step="0.1"
                data-critical-save=""
                value={percent}
                onChange={(event) => {
                  const next = event.target.value;
                  setPercent(next);
                  const live = Number(next);
                  const nextPercent = Number.isFinite(live) ? live : null;
                  onOoPercentChange?.(nextPercent);
                  const pay = computeOwnerOperatorPay(rate === "" ? null : Number(rate), nextPercent);
                  setOoPay(pay != null ? String(pay) : "");
                }}
                onBlur={() => {
                  if (!load || String(load.oo_percent ?? "") === percent) return;
                  persistMoney({
                    oo_percent: percent,
                    ...(ooPay ? { oo_pay: ooPay } : {}),
                  });
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
