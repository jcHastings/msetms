"use client";

import { useActionState, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteCustomerAction } from "@/lib/actions";

export function DeleteCustomerForm({
  customerId,
  customerName,
  disabled = false,
  disabledReason,
  trigger = "button",
  hideTrigger = false,
  confirmOpen,
  onConfirmOpenChange,
}: {
  customerId: number;
  customerName: string;
  disabled?: boolean;
  disabledReason?: string;
  trigger?: "button" | "menu";
  hideTrigger?: boolean;
  confirmOpen?: boolean;
  onConfirmOpenChange?: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(deleteCustomerAction, null);
  const [internalOpen, setInternalOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const open = confirmOpen ?? internalOpen;

  function setOpen(next: boolean) {
    onConfirmOpenChange?.(next);
    if (confirmOpen === undefined) setInternalOpen(next);
  }

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="customer_id" value={customerId} />
      {hideTrigger ? null : (
        <button
          className={trigger === "menu" ? "menu-item w-full text-left text-red-800" : "btn btn-ghost text-rose-700"}
          type="button"
          disabled={disabled || pending}
          title={disabled ? disabledReason : undefined}
          data-delete-customer=""
          onClick={() => {
            if (disabled) return;
            setOpen(true);
          }}
        >
          {pending ? "Deleting…" : trigger === "menu" ? "Delete…" : "Delete customer"}
        </button>
      )}
      {disabled && disabledReason && !hideTrigger ? (
        <p className="mt-1 text-xs text-slate-500">{disabledReason}</p>
      ) : null}
      {state && !state.ok && state.error ? <p className="mt-1 text-xs text-rose-700">{state.error}</p> : null}
      <ConfirmDialog
        open={open}
        title="Delete customer?"
        body={
          <>
            <p className="font-semibold text-slate-800">{customerName}</p>
            <p className="mt-1">This cannot be undone.</p>
          </>
        }
        confirmLabel="Delete customer"
        busy={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
