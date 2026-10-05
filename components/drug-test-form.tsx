"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { createDrugTestAction, deleteDrugTestAction, updateDrugTestAction } from "@/lib/actions";
import {
  DRUG_TEST_RESULTS,
  DRUG_TEST_STATUSES,
  DRUG_TEST_TYPES,
  type DrugTest,
} from "@/lib/drug-tests";

type DriverOption = { id: number; name: string };

export function DrugTestForm({
  test,
  drivers,
  defaultDriverId,
  returnTo = "/compliance?tab=drug",
}: {
  test?: DrugTest;
  drivers: DriverOption[];
  defaultDriverId?: number;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(test ? updateDrugTestAction : createDrugTestAction, null);

  return (
    <form action={formAction} className="card grid max-w-3xl gap-4 p-6 md:grid-cols-2" data-drug-test-form="">
      {test ? <input type="hidden" name="id" value={test.id} /> : null}
      <input type="hidden" name="return_to" value={returnTo} />
      <div className="md:col-span-2">
        <FormBanner result={state} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="driver_id">Driver</label>
        <select id="driver_id" name="driver_id" required defaultValue={test?.driver_id ?? defaultDriverId ?? ""}>
          <option value="">Select driver</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="test_type">Type</label>
        <select id="test_type" name="test_type" required defaultValue={test?.test_type ?? "random"}>
          {DRUG_TEST_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="vendor">Vendor</label>
        <input id="vendor" name="vendor" defaultValue={test?.vendor ?? ""} placeholder="Quest, Concentra…" />
      </div>
      <div className="field">
        <label htmlFor="ordered_on">Ordered date</label>
        <input id="ordered_on" name="ordered_on" type="date" required defaultValue={test?.ordered_on ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="collected_on">Collected date</label>
        <input id="collected_on" name="collected_on" type="date" defaultValue={test?.collected_on ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="result">Result</label>
        <select id="result" name="result" required defaultValue={test?.result ?? "pending"}>
          {DRUG_TEST_RESULTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" required defaultValue={test?.status ?? "ordered"}>
          {DRUG_TEST_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={test?.notes ?? ""} />
      </div>
      <div className="md:col-span-2 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {test ? "Save test" : "Add test"}
        </button>
        {test ? (
          <button formAction={deleteDrugTestAction} className="btn btn-secondary" disabled={pending}>
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
