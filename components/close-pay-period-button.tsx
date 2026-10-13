"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { closeDriverPayPeriodAction } from "@/lib/dispatcher-actions";

export function ClosePayPeriodButton({ from, to }: { from: string; to: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <form ref={formRef} action={closeDriverPayPeriodAction}>
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
      </form>
      <button className="btn btn-secondary" type="button" data-close-pay-period="" onClick={() => setOpen(true)}>
        Close period…
      </button>
      <ConfirmDialog
        open={open}
        title="Close period?"
        body={
          <>
            Close driver pay from <span className="font-semibold">{from}</span> to{" "}
            <span className="font-semibold">{to}</span>? Posted pay cannot be reopened from this screen.
          </>
        }
        confirmLabel="Close period"
        tone="primary"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
