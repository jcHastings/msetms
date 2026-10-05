"use client";

import { deleteFuelTransactionFormAction } from "@/lib/actions";

export function FuelDeleteButton({ fuelId }: { fuelId: number }) {
  return (
    <form
      action={deleteFuelTransactionFormAction}
      onSubmit={(event) => {
        if (!window.confirm("Delete this fuel row? Receipts stay on the load.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="fuel_id" value={fuelId} />
      <button className="btn btn-ghost text-rose-700" type="submit">
        Delete
      </button>
    </form>
  );
}
