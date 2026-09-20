"use client";

import { useState } from "react";
import { ConfirmSubmit } from "@/components/confirm-dialog";
import { EmailInvoiceButton } from "@/components/email-invoice-button";
import { QboInvoiceSendButton } from "@/components/qbo-invoice-send-button";
import { RowOverflowMenu } from "@/components/row-overflow-menu";
import {
  markReceivablePaidAction,
  returnLoadToOperationsFormAction,
} from "@/lib/dispatcher-actions";
import type { InvoiceMailExtraDoc } from "@/lib/load-mail";

type InvoiceActionRow = {
  id: number;
  loadNumber: string;
  invoiceNumber: string;
  alreadySent: boolean;
  paid: boolean;
  email: string;
  lastInvoiceSent: string;
  extras: InvoiceMailExtraDoc[];
  invoiceEmailBody: string;
};

type InvoiceIntent = "email" | "qbo" | "pay" | "return";

export function InvoiceCollapsedActions({ row }: { row: InvoiceActionRow }) {
  const [intent, setIntent] = useState<InvoiceIntent | null>(null);
  const qboLabel = row.alreadySent ? "Send again to QuickBooks…" : "Send to QuickBooks…";
  return (
    <div className="invoice-row-actions" data-invoice-row-actions="">
      <a className="acct-link" href={`/api/loads/${row.id}/invoice`}>
        View PDF
      </a>
      <RowOverflowMenu label={row.invoiceNumber}>
        <button className="menu-item w-full text-left" type="button" onClick={() => setIntent("email")}>
          Email invoice…
        </button>
        <button className="menu-item w-full text-left" type="button" onClick={() => setIntent("qbo")}>
          {qboLabel}
        </button>
        {row.paid ? null : (
          <button className="menu-item w-full text-left" type="button" onClick={() => setIntent("pay")}>
            Record payment…
          </button>
        )}
        <button
          className="menu-item w-full text-left"
          type="button"
          title="Send back to Load Management"
          onClick={() => setIntent("return")}
        >
          Send back to Load Management…
        </button>
      </RowOverflowMenu>
      {intent === "email" ? (
        <EmailInvoiceButton
          loadId={row.id}
          email={row.email}
          lastSent={row.lastInvoiceSent}
          extras={row.extras}
          defaultBody={row.invoiceEmailBody}
          variant="link"
          label="Email invoice..."
          autoOpen
          composerPlacement="dialog"
          onComposerClose={() => setIntent(null)}
        />
      ) : null}
      {intent === "qbo" ? (
        <QboInvoiceSendButton
          loadId={row.id}
          alreadySent={row.alreadySent}
          label={qboLabel}
          variant="link"
          autoConfirm
          onFinished={() => setIntent(null)}
        />
      ) : null}
      <ConfirmSubmit
        action={markReceivablePaidAction}
        hidden={{ load_id: row.id }}
        triggerLabel="Record payment…"
        triggerClassName="menu-item w-full text-left"
        title="Record payment?"
        body={`Mark ${row.invoiceNumber} as paid?`}
        confirmLabel="Record payment"
        tone="primary"
        hideTrigger
        open={intent === "pay"}
        onOpenChange={(next) => {
          if (!next) setIntent(null);
        }}
      />
      <ConfirmSubmit
        action={returnLoadToOperationsFormAction}
        hidden={{ load_id: row.id }}
        triggerLabel="Send back to Load Management…"
        triggerClassName="menu-item w-full text-left"
        titleAttr="Send back to Load Management"
        title="Send back to Load Management?"
        body={`${row.loadNumber} will leave Accounting and return to operations.`}
        confirmLabel="Send back"
        tone="primary"
        hideTrigger
        open={intent === "return"}
        onOpenChange={(next) => {
          if (!next) setIntent(null);
        }}
      />
    </div>
  );
}

export function InvoiceSendPostGroup({ row }: { row: InvoiceActionRow }) {
  return (
    <div className="acct-action-group" data-invoice-send-post="">
      <div className="acct-action-group-label">Send &amp; post</div>
      <EmailInvoiceButton
        loadId={row.id}
        email={row.email}
        lastSent={row.lastInvoiceSent}
        extras={row.extras}
        defaultBody={row.invoiceEmailBody}
        variant="link"
        label="Email invoice..."
      />
      <QboInvoiceSendButton
        loadId={row.id}
        alreadySent={row.alreadySent}
        label={row.alreadySent ? "Send again to QuickBooks..." : "Send to QuickBooks..."}
        variant="link"
      />
      {row.paid ? null : (
        <ConfirmSubmit
          action={markReceivablePaidAction}
          hidden={{ load_id: row.id }}
          triggerLabel="Record payment..."
          triggerClassName="acct-link"
          title="Record payment?"
          body={`Mark ${row.invoiceNumber} as paid?`}
          confirmLabel="Record payment"
          tone="primary"
        />
      )}
      <ConfirmSubmit
        action={returnLoadToOperationsFormAction}
        hidden={{ load_id: row.id }}
        triggerLabel="Send back to Load Management..."
        triggerClassName="acct-link"
        titleAttr="Send back to Load Management"
        title="Send back to Load Management?"
        body={`${row.loadNumber} will leave Accounting and return to operations.`}
        confirmLabel="Send back"
        tone="primary"
      />
    </div>
  );
}
