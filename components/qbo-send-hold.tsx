"use client";

import { useId, type KeyboardEvent, type MouseEvent } from "react";
import { QBO_INVOICE_SEND_DISABLED_MESSAGE } from "@/lib/qbo-send-lock";

/**
 * Send stays on screen so the action is findable, and it does not activate.
 * The reason is visible text tied to the control with aria-describedby.
 * aria-disabled keeps the control in tab order so keyboard and screen-reader
 * users hear that reason. A disabled attribute would skip it.
 */
export function QboSendHold({
  label,
  variant = "button",
  reasonId,
}: {
  label: string;
  variant?: "button" | "link" | "menu";
  /** Use a page-level reason when this control should not repeat the sentence. */
  reasonId?: string;
}) {
  const ownReasonId = useId();
  const describedBy = reasonId ?? ownReasonId;
  const showReason = !reasonId;

  function block(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") block(event);
  }

  const actionClass =
    variant === "button"
      ? "btn btn-secondary qbo-send-hold-action"
      : variant === "menu"
        ? "menu-item qbo-send-hold-action w-full text-left"
        : "acct-link qbo-send-hold-action";

  return (
    <div className="qbo-send-hold" data-qbo-send-hold="" data-variant={variant}>
      <button
        type="button"
        className={actionClass}
        role={variant === "menu" ? "menuitem" : undefined}
        aria-disabled="true"
        aria-describedby={describedBy}
        data-qbo-send=""
        onClick={block}
        onKeyDown={onKeyDown}
      >
        {label}
      </button>
      {showReason ? (
        <p id={ownReasonId} className="qbo-send-hold-reason" data-qbo-send-locked="">
          {QBO_INVOICE_SEND_DISABLED_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}
