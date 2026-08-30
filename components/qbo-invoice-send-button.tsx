"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendToQuickbooksAction } from "@/lib/actions";

export function QboInvoiceSendButton({
  loadId,
  alreadySent,
  label,
}: {
  loadId: number;
  alreadySent: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

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
      return;
    }
    setNotice({
      ok: true,
      text: result.message || (alreadySent ? "Invoice sent again to QuickBooks." : "Invoice sent to QuickBooks."),
    });
    // First send flips Sent / Not sent. Send-again keeps this notice so it is not a dead click.
    if (!alreadySent) router.refresh();
  }

  return (
    <div className="max-w-[16rem] space-y-1">
      <button
        className="btn btn-secondary"
        type="button"
        data-qbo-send=""
        disabled={pending}
        onClick={() => void send()}
      >
        {pending ? "Sending…" : label}
      </button>
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
