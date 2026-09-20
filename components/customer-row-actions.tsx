"use client";

import { useState } from "react";
import Link from "next/link";
import { DeleteCustomerForm } from "@/components/delete-customer-form";
import { RowOverflowMenu } from "@/components/row-overflow-menu";

export function CustomerRowActions({
  customerId,
  customerName,
  canManage,
  hasLoads,
  disabledReason,
}: {
  customerId: number;
  customerName: string;
  canManage: boolean;
  hasLoads: boolean;
  disabledReason?: string;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/customers/${customerId}`} className="btn btn-secondary">
        {canManage ? "Edit" : "View"}
      </Link>
      {canManage ? (
        <>
          <RowOverflowMenu label={customerName}>
            <button
              className="menu-item w-full text-left text-red-800"
              type="button"
              disabled={hasLoads}
              title={hasLoads ? disabledReason : undefined}
              data-delete-customer=""
              onClick={() => setDeleteOpen(true)}
            >
              Delete…
            </button>
            {hasLoads && disabledReason ? <p className="px-3 py-2 text-xs text-slate-500">{disabledReason}</p> : null}
          </RowOverflowMenu>
          <DeleteCustomerForm
            customerId={customerId}
            customerName={customerName}
            disabled={hasLoads}
            disabledReason={disabledReason}
            hideTrigger
            confirmOpen={deleteOpen}
            onConfirmOpenChange={setDeleteOpen}
          />
        </>
      ) : null}
    </div>
  );
}
