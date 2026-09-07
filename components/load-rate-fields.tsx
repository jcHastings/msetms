"use client";

import { useEffect, useRef, useState } from "react";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import { computeOwnerOperatorPay, impliedOwnerOperatorPercent } from "@/lib/settlement";
import type { Load } from "@/lib/types";

function persistMoney(
  persistFields: (fields: Record<string, string>) => void,
  load: Load | undefined,
  fields: Record<string, string>,
) {
  if (!load) return;
  persistFields(fields);
}

/** Customer rate — Income / Budget on an existing load, New load on create. */
export function CustomerRateField({
  load,
  defaultsRate = null,
  onRateChange,
}: {
  load?: Load;
  defaultsRate?: number | null;
  onRateChange?: (rate: string) => void;
}) {
  const { persistFields } = useLoadAssignPersist(load?.id);
  const [rate, setRate] = useState(
    load?.rate != null ? String(load.rate) : defaultsRate != null ? String(defaultsRate) : "",
  );

  return (
    <div className="field" data-income-customer-rate="">
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
          onRateChange?.(next);
        }}
        onBlur={() => {
          if (load && String(load.rate ?? "") !== rate) persistMoney(persistFields, load, { rate });
        }}
      />
      {!load ? (
        <p className="mt-1 text-xs text-slate-500" data-create-rate-note="">
          This becomes the customer rate on Income / Budget.
        </p>
      ) : null}
    </div>
  );
}

/** Owner-operator rate — Expenses only. */
export function OwnerOperatorPayFields({
  load,
  rate = "",
  ooPercent = null,
  onOoPercentChange,
}: {
  load?: Load;
  rate?: string;
  ooPercent?: number | null;
  onOoPercentChange?: (percent: number | null) => void;
}) {
  const { persistFields } = useLoadAssignPersist(load?.id);
  const [ooPay, setOoPay] = useState(load?.oo_pay != null ? String(load.oo_pay) : "");
  const [percent, setPercent] = useState(
    load?.oo_percent != null ? String(load.oo_percent) : ooPercent != null ? String(ooPercent) : "",
  );
  const lastOoPercent = useRef(ooPercent);
  const lastRate = useRef(rate);
  useEffect(() => {
    const percentChanged = ooPercent !== lastOoPercent.current;
    const rateChanged = rate !== lastRate.current;
    lastOoPercent.current = ooPercent;
    lastRate.current = rate;
    if (!percentChanged && !rateChanged) return;
    if (ooPercent == null) {
      if (percentChanged) {
        setPercent("");
        setOoPay("");
      }
      return;
    }
    if (percentChanged) setPercent(String(ooPercent));
    const livePercent = percentChanged ? ooPercent : Number(percent);
    const pay = computeOwnerOperatorPay(
      rate === "" ? null : Number(rate),
      Number.isFinite(livePercent) ? livePercent : ooPercent,
    );
    setOoPay(pay != null ? String(pay) : "");
  }, [ooPercent, rate, percent]);

  if (ooPercent == null) return null;

  return (
    <div className="field" data-oo-pay-pair="" data-expense-oo-pay="">
      <div className="mb-1 text-sm font-semibold text-slate-900">Owner-operator rate</div>
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
              persistMoney(persistFields, load, {
                oo_pay: ooPay,
                ...(percent ? { oo_percent: percent } : {}),
              });
            }}
          />
        </div>
        <div className="field" data-oo-percent="">
          <label htmlFor="oo_percent">Percent of customer rate</label>
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
              persistMoney(persistFields, load, {
                oo_percent: percent,
                ...(ooPay ? { oo_pay: ooPay } : {}),
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** New-load customer rate only. OO rate is entered on Expenses after the load exists. */
export function LoadRateFields({
  load,
  defaultsRate = null,
}: {
  load?: Load;
  defaultsRate?: number | null;
}) {
  return <CustomerRateField load={load} defaultsRate={defaultsRate} />;
}
