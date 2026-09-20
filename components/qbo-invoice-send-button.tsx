"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { sendToQuickbooksAction } from "@/lib/actions";

export function QboInvoiceSendButton({
  loadId,
  alreadySent,
  label,
  variant = "button",
  autoConfirm = false,
  onFinished,
}: {
  loadId: number;
  alreadySent: boolean;
  label: string;
  variant?: "button" | "link";
  autoConfirm?: boolean;
  onFinished?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(autoConfirm);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (autoConfirm) setConfirmOpen(true);
  }, [autoConfirm]);

  async function send() {
    setPending(true);
    setNotice(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    if (alreadySent) form.set("confirm_resend", "1");
    const result = await sendToQuickbooksAction(null, form);
    setPending(false);
    if (!result.ok) {
      setNotice({ ok: false, text: result.error });
      onFinished?.();
      return;
    }
    setNotice({
      ok: true,
      text: result.message || (alreadySent ? "Invoice sent again to QuickBooks." : "Invoice sent to QuickBooks."),
    });
    // First send flips Sent / Not sent. Send-again keeps this notice so it is not a dead click.
    if (!alreadySent) router.refresh();
    onFinished?.();
  }

  return (
    <div className={variant === "link" ? "space-y-1" : "max-w-[16rem] space-y-1"}>
      {autoConfirm ? null : (
        <button
          className={variant === "link" ? "acct-link" : "btn btn-secondary"}
          type="button"
          data-qbo-send=""
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          {pending ? "Sending…" : label}
        </button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={alreadySent ? "Send again to QuickBooks?" : "Send to QuickBooks?"}
        body={
          alreadySent
            ? "This invoice was already exported. Send it again?"
            : "Export this invoice to QuickBooks?"
        }
        confirmLabel={alreadySent ? "Send again" : "Send to QuickBooks"}
        tone="primary"
        busy={pending}
        onCancel={() => {
          setConfirmOpen(false);
          onFinished?.();
        }}
        onConfirm={() => {
          setConfirmOpen(false);
          void send();
        }}
      />
      {notice ? (
        <p
          className={notice.ok ? "text-xs text-emerald-800" : "text-xs text-rose-700"}
          data-qbo-send-notice=""
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
