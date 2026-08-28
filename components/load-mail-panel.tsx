"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendLoadMailAction } from "@/lib/dispatcher-actions";
import type { LoadMailKind } from "@/lib/mail-shared";

export function LoadMailPanel({
  loadId,
  loadNumber,
  driverEmail,
  customerEmail,
  driverAssigned,
  lastDriverSent,
  lastCustomerSent,
}: {
  loadId: number;
  loadNumber: string;
  driverEmail: string;
  customerEmail: string;
  driverAssigned?: boolean;
  lastDriverSent?: string;
  lastCustomerSent?: string;
}) {
  return (
    <section className="card mb-4 p-4" data-load-mail="">
      <h2 className="text-sm font-semibold">Email / Notify</h2>
      <p className="mt-1 text-sm text-slate-600">Sends from MS Express TMS. Confirm, then Send.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <LoadMailButton
          loadId={loadId}
          loadNumber={loadNumber}
          kind="driver_load"
          label="Email driver load"
          email={driverEmail}
          missing={driverAssigned ? "This driver has no email on the driver record." : "Assign a driver first."}
          confirm={`Send load information to ${driverEmail}?`}
          lastSent={lastDriverSent}
        />
        <LoadMailButton
          loadId={loadId}
          loadNumber={loadNumber}
          kind="customer_update"
          label="Email customer update"
          email={customerEmail}
          missing="This load has no customer email."
          confirm={`Send tracking update to ${customerEmail}?`}
          lastSent={lastCustomerSent}
        />
      </div>
    </section>
  );
}

export function LoadMailMenuItems({
  loadId,
  loadNumber,
  driverEmail,
  customerEmail,
  driverAssigned,
  onNotice,
}: {
  loadId: number;
  loadNumber: string;
  driverEmail: string;
  customerEmail: string;
  driverAssigned?: boolean;
  onNotice: (notice: { tone: "error" | "ok"; text: string }) => void;
}) {
  return (
    <>
      <LoadMailMenuItem
        loadId={loadId}
        loadNumber={loadNumber}
        kind="driver_load"
        label="Email driver load"
        email={driverEmail}
        missing={driverAssigned ? "This driver has no email on the driver record." : "Assign a driver first."}
        confirm={`Send load information to ${driverEmail}?`}
        onNotice={onNotice}
      />
      <LoadMailMenuItem
        loadId={loadId}
        loadNumber={loadNumber}
        kind="customer_update"
        label="Email customer update"
        email={customerEmail}
        missing="This load has no customer email."
        confirm={`Send tracking update to ${customerEmail}?`}
        onNotice={onNotice}
      />
    </>
  );
}

function LoadMailButton({
  loadId,
  loadNumber,
  kind,
  label,
  email,
  missing,
  confirm,
  lastSent,
}: {
  loadId: number;
  loadNumber: string;
  kind: LoadMailKind;
  label: string;
  email: string;
  missing: string;
  confirm: string;
  lastSent?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function send() {
    if (!email.trim()) {
      setNotice({ tone: "error", text: missing });
      return;
    }
    if (!window.confirm(confirm)) return;
    setPending(true);
    setNotice(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    form.set("kind", kind);
    form.set("load_number", loadNumber);
    const result = await sendLoadMailAction(form);
    setPending(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "ok", text: result.message ?? "Sent." });
    router.refresh();
  }

  return (
    <div className="min-w-[14rem] flex-1">
      <button className="btn btn-secondary" type="button" disabled={pending} onClick={() => void send()}>
        {pending ? "Sending…" : label}
      </button>
      {lastSent ? <div className="mt-1 text-xs text-slate-500">Last sent {lastSent}</div> : null}
      {notice ? (
        <p
          className={`mt-2 rounded-md px-2 py-1 text-sm ${
            notice.tone === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-800"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

function LoadMailMenuItem({
  loadId,
  kind,
  label,
  email,
  missing,
  confirm,
  onNotice,
}: {
  loadId: number;
  loadNumber: string;
  kind: LoadMailKind;
  label: string;
  email: string;
  missing: string;
  confirm: string;
  onNotice: (notice: { tone: "error" | "ok"; text: string }) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="menu-item w-full text-left disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        if (!email.trim()) {
          onNotice({ tone: "error", text: missing });
          return;
        }
        if (!window.confirm(confirm)) return;
        setPending(true);
        const form = new FormData();
        form.set("load_id", String(loadId));
        form.set("kind", kind);
        const result = await sendLoadMailAction(form);
        setPending(false);
        if (!result.ok) {
          onNotice({ tone: "error", text: result.error });
          return;
        }
        onNotice({ tone: "ok", text: result.message ?? "Sent." });
        router.refresh();
      }}
    >
      {pending ? "Sending…" : label}
    </button>
  );
}
