"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadBasicsScreen, type LoadFormDefaults } from "@/components/load-basics-screen";
import { LoadCarrierScreen } from "@/components/load-carrier-screen";
import { LoadCustomerScreen } from "@/components/load-customer-screen";
import { LoadLaneFields } from "@/components/load-lane-fields";
import { useLoadEdit } from "@/components/load-edit-context";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import type { ActionResult, Customer, DriverWithTruck, Load, Location, Trailer, Truck } from "@/lib/types";

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
  const edit = useLoadEdit();
  const workspace = standalone ? null : edit;
  const resolvedScreen = resolveScreen(screen, workspace?.tab, standalone);
  const formId = workspace?.formId;
  const [state, formAction, pending] = useActionState(action, null);
  const extraDefaults = defaults ?? {};
  const [blockExpired, setBlockExpired] = useState(false);
  const canSubmit = !pending && !blockExpired;
  const onExpiredChange = useCallback((expired: boolean, confirmed: boolean) => {
    setBlockExpired(expired && !confirmed);
  }, []);
  const card = Boolean(workspace);

  useEffect(() => {
    workspace?.setSubmitState({ canSubmit, pending });
  }, [workspace?.setSubmitState, canSubmit, pending]);

  useEffect(() => {
    if (state && "ok" in state && state.ok) workspace?.clearDirty();
  }, [workspace?.clearDirty, state]);

  return (
    <form id={formId} action={formAction} className={workspace ? "space-y-6" : "card space-y-6 p-6"}>
      <FormBanner result={state} />
      {inboxId ? <input type="hidden" name="inbox_id" value={inboxId} /> : null}
      <input type="hidden" name="return_to" value={returnTo} />

      {resolvedScreen === "basics" || resolvedScreen === "all" ? (
        <LoadBasicsScreen
          load={load}
          defaults={extraDefaults}
          commodities={commodities}
          extraStatuses={extraStatuses}
          weightUnit={weightUnit}
          equipmentChoices={equipmentChoices}
          card={card}
        />
      ) : null}
      {resolvedScreen === "customer" || resolvedScreen === "all" ? (
        <LoadCustomerScreen customers={customers} load={load} defaults={extraDefaults} card={card} />
      ) : null}
      {resolvedScreen === "assets" || resolvedScreen === "all" ? (
        <LoadCarrierScreen
          drivers={drivers}
          trucks={trucks}
          trailers={trailers}
          load={load}
          defaultOoPercent={defaultOoPercent}
          alertWindows={alertWindows}
          card={card}
          onExpiredChange={onExpiredChange}
        />
      ) : null}
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
