"use client";

import { useRef, useState, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        data-confirm-dialog=""
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{body}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={tone === "danger" ? "btn btn-danger" : "btn btn-primary"}
            type="button"
            disabled={busy}
            data-confirm-dialog-accept=""
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmSubmit({
  action,
  hidden,
  triggerLabel,
  triggerClassName,
  title,
  body,
  confirmLabel,
  tone = "danger",
  titleAttr,
  hideTrigger = false,
  open: openProp,
  onOpenChange,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string | number>;
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  titleAttr?: string;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;

  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openProp === undefined) setInternalOpen(next);
  }

  return (
    <>
      <form ref={formRef} action={action}>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ))}
      </form>
      {hideTrigger ? null : (
        <button
          className={triggerClassName}
          type="button"
          title={titleAttr}
          onClick={() => setOpen(true)}
        >
          {triggerLabel}
        </button>
      )}
      <ConfirmDialog
        open={open}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        tone={tone}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
