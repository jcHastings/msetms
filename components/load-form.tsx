"use client";

import { startTransition, useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormBanner } from "@/components/form-banner";
import { LoadBasicsScreen, type LoadFormDefaults } from "@/components/load-basics-screen";
import { LoadCarrierScreen } from "@/components/load-carrier-screen";
import { LoadCustomerScreen } from "@/components/load-customer-screen";
import { LoadLaneFields } from "@/components/load-lane-fields";
import { useLoadEdit } from "@/components/load-edit-context";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import { parsedStopHasDetails, type ParsedStop } from "@/lib/rate-con-shared";
import { isOwnerOperator, type ActionResult, type Customer, type DriverWithTruck, type Load, type Location, type Trailer, type Truck } from "@/lib/types";

export type LoadFormScreen = "basics" | "customer" | "assets" | "all";

type Props = {
  customers: Customer[];
  trucks: Truck[];
  trailers?: Trailer[];
  drivers: DriverWithTruck[];
  locations?: Location[];
  load?: Load;
  defaults?: LoadFormDefaults;
  inboxId?: string;
  commodities?: string[];
  extraStatuses?: Array<{ value: string; label: string }>;
  defaultOoPercent?: number;
  weightUnit?: string;
  currency?: string;
  targetMarginPercent?: number;
  placesEnabled?: boolean;
  alertWindows?: ComplianceWindows;
  equipmentChoices?: Array<{ value: string; label: string }>;
  returnTo?: string;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  standalone?: boolean;
  screen?: LoadFormScreen;
  includeLane?: boolean;
};

export function LoadForm({
  customers,
  trucks,
  trailers = [],
  drivers,
  locations = [],
  load,
  defaults,
  inboxId,
  commodities = [],
  extraStatuses = [],
  defaultOoPercent = 75,
  weightUnit = "lb",
  alertWindows = DEFAULT_COMPLIANCE_WINDOWS,
  equipmentChoices = [],
  returnTo = "/board",
  action,
  submitLabel,
  standalone = false,
  screen,
  includeLane = false,
}: Props) {
  const router = useRouter();
  const edit = useLoadEdit();
  const workspace = standalone ? null : edit;
  const resolvedScreen = resolveScreen(screen, workspace?.tab, standalone);
  const formId = workspace?.formId;
  const [state, formAction, pending] = useActionState(action, null);
  const extraDefaults = defaults ?? {};
  const [blockExpired, setBlockExpired] = useState(false);
  const [liveOoPercent, setLiveOoPercent] = useState<number | null>(() => {
    const driver = drivers.find((item) => String(item.id) === (load?.driver_id ? String(load.driver_id) : ""));
    if (!driver || !isOwnerOperator(driver.driver_type)) return null;
    return driver.pay_percent ?? load?.oo_percent ?? defaultOoPercent;
  });
  const canSubmit = !pending && !blockExpired;
  const onExpiredChange = useCallback((expired: boolean, confirmed: boolean) => {
    setBlockExpired(expired && !confirmed);
  }, []);
  const onDriverIdChange = useCallback(
    (nextId: string) => {
      const driver = drivers.find((item) => String(item.id) === nextId);
      if (!driver || !isOwnerOperator(driver.driver_type)) {
        setLiveOoPercent(null);
        return;
      }
      setLiveOoPercent(driver.pay_percent ?? defaultOoPercent);
    },
    [drivers, defaultOoPercent],
  );
  const card = Boolean(workspace);

  useEffect(() => {
    workspace?.setSubmitState({ canSubmit, pending });
  }, [workspace?.setSubmitState, canSubmit, pending]);

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      workspace?.clearDirty();
      router.refresh();
    }
  }, [workspace?.clearDirty, state, router]);

  return (
    <form
      id={formId}
      className={workspace ? "space-y-6" : "card space-y-6 p-6"}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => {
          formAction(new FormData(event.currentTarget));
        });
      }}
    >
      <FormBanner result={state} />
      {inboxId ? <input type="hidden" name="inbox_id" value={inboxId} /> : null}
      <RateConStopFields prefix="pickup" stop={extraDefaults.shipper} />
      <RateConStopFields prefix="delivery" stop={extraDefaults.consignee} />
      {extraDefaults.extra_stops?.length ? (
        <input type="hidden" name="extra_stops_json" value={JSON.stringify(extraDefaults.extra_stops)} />
      ) : null}
      <input type="hidden" name="return_to" value={load ? `/loads/${load.id}` : returnTo} />
      {load ? <input type="hidden" name="stay_on_load" value="1" /> : null}

      <div
        hidden={resolvedScreen !== "basics" && resolvedScreen !== "all"}
        className={resolvedScreen === "basics" || resolvedScreen === "all" ? undefined : "hidden"}
        data-load-screen="basics"
      >
        <LoadBasicsScreen
          load={load}
          defaults={extraDefaults}
          commodities={commodities}
          extraStatuses={extraStatuses}
          weightUnit={weightUnit}
          equipmentChoices={equipmentChoices}
          card={card}
          ooPercent={liveOoPercent}
          onOoPercentChange={setLiveOoPercent}
        />
      </div>
      <div
        hidden={resolvedScreen !== "customer" && resolvedScreen !== "all"}
        className={resolvedScreen === "customer" || resolvedScreen === "all" ? undefined : "hidden"}
        data-load-screen="customer"
      >
        <LoadCustomerScreen customers={customers} load={load} defaults={extraDefaults} card={card} />
      </div>
      <div
        hidden={resolvedScreen !== "assets" && resolvedScreen !== "all"}
        className={resolvedScreen === "assets" || resolvedScreen === "all" ? undefined : "hidden"}
        data-assign-fields=""
        data-load-screen="assets"
      >
        <LoadCarrierScreen
          drivers={drivers}
          trucks={trucks}
          trailers={trailers}
          load={load}
          defaultOoPercent={defaultOoPercent}
          alertWindows={alertWindows}
          card={card}
          onExpiredChange={onExpiredChange}
          onDriverIdChange={onDriverIdChange}
          ooPercent={liveOoPercent}
          onOoPercentChange={setLiveOoPercent}
        />
      </div>
      {includeLane ? <LoadLaneFields load={load} defaults={extraDefaults} locations={locations} /> : null}
      {resolvedScreen === "all" && !includeLane && !load ? (
        <section className={card ? "card p-6" : undefined}>
          <div className="field">
            <label htmlFor="special_instructions">Routing notes</label>
            <textarea
              id="special_instructions"
              name="special_instructions"
              rows={2}
              defaultValue={extraDefaults.special_instructions ?? ""}
            />
          </div>
        </section>
      ) : null}

      {workspace ? null : (
        <div className="flex justify-end">
          <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}

function RateConStopFields({ prefix, stop }: { prefix: "pickup" | "delivery"; stop?: ParsedStop }) {
  if (!stop || !parsedStopHasDetails(stop)) return null;
  return (
    <>
      <input type="hidden" name={`${prefix}_stop_name`} value={stop.name} />
      <input type="hidden" name={`${prefix}_stop_street`} value={stop.street} />
      <input type="hidden" name={`${prefix}_stop_city`} value={stop.city} />
      <input type="hidden" name={`${prefix}_stop_state`} value={stop.state} />
      <input type="hidden" name={`${prefix}_stop_zip`} value={stop.zip} />
      <input type="hidden" name={`${prefix}_stop_phone`} value={stop.phone} />
    </>
  );
}

function resolveScreen(
  screen: LoadFormScreen | undefined,
  tab: string | undefined,
  standalone: boolean,
): LoadFormScreen {
  if (screen) return screen;
  if (standalone) return "all";
  if (tab === "basics" || tab === "customer" || tab === "assets") return tab;
  return "all";
}
