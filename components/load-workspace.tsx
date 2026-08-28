"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDismissable } from "@/components/use-dismissable";
import { closeLoadOverlay } from "@/components/page-overlay-host";
import { LoadEditProvider } from "@/components/load-edit-context";
import {
  assignLoadDispatcherAction,
  cloneLoadAction,
  requestDriverDocumentsAction,
  requestPodAction,
  saveTemplateAction,
  sendLoadMailAction,
  sendLoadSmsAction,
  sendLoadWhatsAppAction,
  watchLoadAction,
} from "@/lib/dispatcher-actions";
import { LoadMailMenuItems } from "@/components/load-mail-panel";
import { SendToAccountingControls } from "@/components/send-to-accounting";
import { updateLoadStatusAction } from "@/lib/actions";
import { SMS_MISSING_KEYS } from "@/lib/sms-shared";
import { WHATSAPP_MISSING } from "@/lib/whatsapp-shared";
import { isFormTab, isSaveTab, loadFormTabsForRole, parseLoadTab, tabNeedsServerPaint, type LoadTab } from "@/lib/load-tabs";
import {
  canAssignLoads,
  canLogCheckCall,
  canSendSms,
  canViewAudit,
  canViewLoadFinancials,
} from "@/lib/settings-shared";

export function LoadWorkspace({
  loadId,
  status,
  initialTab,
  loadSummary,
  driverAssigned,
  driverPhone,
  dispatcherId,
  dispatchers,
  docsRequested,
  smsConfigured,
  whatsappConfigured = false,
  role,
  returnTo = "/board",
  watched = false,
  create = false,
  loadNumber = "",
  customerName = "",
  contactEmail = "",
  driverEmail = "",
  readyToInvoice = false,
  nonRevenue = false,
  accountingDesk = "operations",
  canSendToAccounting = false,
  canReturnFromAccounting = false,
  children,
}: {
  loadId: number | null;
  status: string;
  initialTab: string;
  loadSummary: string;
  driverAssigned: boolean;
  driverPhone: string;
  dispatcherId: number | null;
  dispatchers: Array<{ id: number; name: string }>;
  docsRequested: boolean;
  smsConfigured: boolean;
  whatsappConfigured?: boolean;
  role: string;
  returnTo?: string;
  watched?: boolean;
  create?: boolean;
  loadNumber?: string;
  customerName?: string;
  contactEmail?: string;
  driverEmail?: string;
  readyToInvoice?: boolean;
  nonRevenue?: boolean;
  accountingDesk?: string;
  canSendToAccounting?: boolean;
  canReturnFromAccounting?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const formId = useId().replace(/:/g, "") + "-load-form";
  const [tab, setTabState] = useState<LoadTab>(() => parseLoadTab(initialTab));
  const [dirty, setDirty] = useState(false);
  const [canSubmit, setCanSubmit] = useState(true);
  const [pending, setPending] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [smsNotice, setSmsNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [smsPending, setSmsPending] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  const setSubmitState = useCallback((state: { canSubmit: boolean; pending: boolean }) => {
    setCanSubmit(state.canSubmit);
    setPending(state.pending);
  }, []);

  const setTab = useCallback(
    (next: LoadTab, hash?: string) => {
      if (dirty && tab !== next && isFormTab(tab)) {
        if (!window.confirm("You have unsaved changes on this screen. Switch anyway?")) return;
        setDirty(false);
      }
      setTabState(next);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      url.hash = hash ? hash.replace(/^#/, "") : "";
      const href = `${url.pathname}?${url.searchParams.toString()}${url.hash ? `#${url.hash}` : ""}`;
      if (tabNeedsServerPaint(next)) {
        router.replace(href, { scroll: false });
      } else {
        window.history.replaceState(window.history.state, "", href);
      }
      if (hash) {
        window.setTimeout(() => document.getElementById(hash.replace(/^#/, ""))?.scrollIntoView({ block: "start" }), 0);
      }
    },
    [dirty, tab, router],
  );

  useEffect(() => {
    function onPop() {
      setTabState(parseLoadTab(new URLSearchParams(window.location.search).get("tab")));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    function onLeave(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function confirmLeave(href: string) {
    if (dirty && !window.confirm("You have unsaved load changes. Leave this page anyway?")) return;
    const embed = new URLSearchParams(window.location.search).get("embed") === "1";
    if (embed && window.parent !== window) {
      window.parent.postMessage({ type: "ms-close-load" }, window.location.origin);
      return;
    }
    if (new URL(window.location.href).searchParams.has("open")) {
      closeLoadOverlay(href);
      return;
    }
    router.push(href);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (dispatchOpen) {
        setDispatchOpen(false);
        return;
      }
      if (openMenu) {
        setOpenMenu(null);
        return;
      }
      confirmLeave(returnTo);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function driverPhoneError(channel: "sms" | "whatsapp" = "sms"): string | null {
    if (channel === "sms" && !smsConfigured) return SMS_MISSING_KEYS;
    if (channel === "whatsapp" && !whatsappConfigured) return WHATSAPP_MISSING;
    if (!driverAssigned) return "Assign a driver first.";
    if (!driverPhone.trim()) return "The assigned driver needs a mobile number.";
    return null;
  }

  function requireDriverPhone(channel: "sms" | "whatsapp" = "sms"): boolean {
    const error = driverPhoneError(channel);
    if (!error) return true;
    setSmsNotice({ tone: "error", text: error });
    return false;
  }

  async function sendSms(kind: "message" | "load_info", body?: string) {
    if (!loadId) return;
    setSmsPending(true);
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("kind", kind);
    if (body) formData.set("body", body);
    const result = await sendLoadSmsAction(formData);
    setSmsPending(false);
    if (!result.ok) {
      setSmsNotice({ tone: "error", text: result.error });
      return;
    }
    setDispatchOpen(false);
    setSmsNotice({ tone: "ok", text: result.message ?? "Text sent." });
    router.refresh();
  }

  async function sendWhatsApp(kind: "message" | "load_info", body?: string) {
    if (!loadId) return;
    setSmsPending(true);
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("kind", kind);
    if (body) formData.set("body", body);
    const result = await sendLoadWhatsAppAction(formData);
    setSmsPending(false);
    if (!result.ok) {
      setSmsNotice({ tone: "error", text: result.error });
      return;
    }
    setDispatchOpen(false);
    setSmsNotice({ tone: "ok", text: result.message ?? "WhatsApp sent." });
    router.refresh();
  }

  return (
    <LoadEditProvider
      value={{ tab, setTab, dirty, markDirty, clearDirty, formId, canSubmit, pending, setSubmitState }}
    >
      <div className="load-tabs mb-3 flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
        {create ? (
          <p className="px-3 py-2 text-sm font-semibold text-slate-600">New load</p>
        ) : (
          <nav className="flex flex-wrap gap-1" aria-label="Load tabs">
            {loadFormTabsForRole(role).map((item) => (
              <button
                key={item.value}
                type="button"
                className={`load-tab rounded-t-md px-3 py-2 text-sm font-semibold ${
                  tab === item.value ? "load-tab-active" : ""
                }`}
                aria-current={tab === item.value ? "page" : undefined}
                onClick={() => setTab(item.value)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {create || isSaveTab(tab) ? (
            <button className="btn btn-primary" type="submit" form={formId} disabled={!canSubmit}>
              {pending ? "Saving…" : "Save"}
            </button>
          ) : null}
          <button
            className="btn load-tab-back"
            type="button"
            data-load-overlay-close=""
            onClick={() => confirmLeave(returnTo)}
          >
            Close
          </button>
        </div>
      </div>

      {loadId ? (
      <div className="load-actions mb-4 px-4 py-3">
        <div className="load-actions-label mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]">Load Actions</div>
        <div className="flex flex-wrap items-center gap-2">
        {canSendSms(role) ? (
          <button
            type="button"
            className="btn load-action-btn"
            onClick={() => {
              if (!requireDriverPhone()) return;
              setSmsNotice(null);
              setDispatchOpen(true);
            }}
          >
            Text dispatch to driver
          </button>
        ) : null}
        {canSendSms(role) ? (
          <button
            type="button"
            className="btn load-action-btn"
            onClick={() => {
              if (!requireDriverPhone("whatsapp")) return;
              setSmsNotice(null);
              setDispatchOpen(true);
            }}
          >
            WhatsApp load
          </button>
        ) : null}
        <ActionMenu label="Load Log" openMenu={openMenu} setOpenMenu={setOpenMenu}>
          {canLogCheckCall(role) ? (
            <button type="button" className="menu-item" onClick={() => setTab("log", "load-check-call")}>
              Log Check Call
            </button>
          ) : null}
          <button type="button" className="menu-item" onClick={() => setTab("log", "load-log")}>
            View Load Log
          </button>
        </ActionMenu>
        <ActionMenu label="Dispatch and Tracking" openMenu={openMenu} setOpenMenu={setOpenMenu}>
          <button type="button" className="menu-item" onClick={() => setTab("log", "load-map")}>
            Load map
          </button>
          <button type="button" className="menu-item" onClick={() => setTab("log")}>
            Tracking and status
          </button>
          {canSendSms(role) ? (
            <>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  if (!requireDriverPhone()) return;
                  const body = window.prompt("Short message to the assigned driver:");
                  if (body == null) return;
                  if (!body.trim()) {
                    window.alert("Type a short message.");
                    return;
                  }
                  void sendSms("message", body);
                }}
              >
                Send Text Message
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  if (!requireDriverPhone("whatsapp")) return;
                  const body = window.prompt("Short WhatsApp to the assigned driver:");
                  if (body == null) return;
                  if (!body.trim()) {
                    window.alert("Type a short message.");
                    return;
                  }
                  void sendWhatsApp("message", body);
                }}
              >
                Send WhatsApp
              </button>
            </>
          ) : null}
        </ActionMenu>
        <ActionMenu label="Load Documents" openMenu={openMenu} setOpenMenu={setOpenMenu}>
          <button type="button" className="menu-item" onClick={() => setTab("docs", "load-documents")}>
            View load docs
          </button>
          <button type="button" className="menu-item" onClick={() => setTab("docs", "load-documents")}>
            Upload a Document
          </button>
          <MenuAction
            label={docsRequested ? "Documents already requested" : "Request Documents From Driver"}
            disabled={!driverAssigned || docsRequested}
            run={async () => {
              const formData = new FormData();
              formData.set("load_id", String(loadId));
              return requestDriverDocumentsAction(formData);
            }}
          />
          <MenuAction
            label="Request POD"
            disabled={!driverAssigned}
            run={async () => {
              const formData = new FormData();
              formData.set("load_id", String(loadId));
              return requestPodAction(formData);
            }}
          />
          {contactEmail.trim() ? (
            <a
              className="menu-item"
              href={`mailto:${encodeURIComponent(contactEmail.trim())}?subject=${encodeURIComponent(`Detention request — ${loadNumber}`)}&body=${encodeURIComponent(`Please confirm detention on ${loadNumber} for ${customerName}.\n\n`)}`}
            >
              Request Detention email
            </a>
          ) : (
            <span className="menu-item text-slate-400">Request Detention email (add customer email)</span>
          )}
          {loadId && canSendSms(role) ? (
            <LoadMailMenuItems
              loadId={loadId}
              loadNumber={loadNumber}
              driverEmail={driverEmail}
              customerEmail={contactEmail}
              driverAssigned={driverAssigned}
              onNotice={setSmsNotice}
            />
          ) : null}
        </ActionMenu>
        {canViewLoadFinancials(role) || canViewAudit(role) || canAssignLoads(role) ? (
        <ActionMenu label="Admin / Financials" openMenu={openMenu} setOpenMenu={setOpenMenu}>
          {loadId && (canSendToAccounting || canReturnFromAccounting) ? (
            <SendToAccountingControls
              loadId={loadId}
              loadNumber={loadNumber}
              status={status}
              desk={accountingDesk}
              canSend={canSendToAccounting && !nonRevenue}
              canReturn={canReturnFromAccounting}
              variant="menu"
            />
          ) : null}
          {canViewAudit(role) ? (
            <button type="button" className="menu-item" onClick={() => setTab("log", "accountability")}>
              View Accountability Log
            </button>
          ) : null}
          {canAssignLoads(role) ? (
          <form action={assignLoadDispatcherAction} className="border-t border-slate-100 px-3 py-2">
            <input type="hidden" name="load_id" value={loadId} />
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Assign dispatcher
            </label>
            <select
              name="dispatcher_id"
              defaultValue={dispatcherId ?? ""}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">Unassigned</option>
              {dispatchers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <button className="menu-item mt-1 w-full px-0 text-left" type="submit">
              Save dispatcher
            </button>
          </form>
          ) : null}
        </ActionMenu>
        ) : null}
        <ActionMenu label="Copy / Cancel / Archive" openMenu={openMenu} setOpenMenu={setOpenMenu}>
          <form action={cloneLoadAction}>
            <input type="hidden" name="load_id" value={loadId} />
            <button className="menu-item w-full text-left" type="submit">
              Copy This Load
            </button>
          </form>
          <form action={watchLoadAction}>
            <input type="hidden" name="load_id" value={loadId} />
            <input type="hidden" name="watched" value={watched ? "0" : "1"} />
            <button className="menu-item w-full text-left" type="submit">
              {watched ? "Unwatch" : "Watch this load"}
            </button>
          </form>
          <form action={saveTemplateAction} className="border-t border-slate-100 px-3 py-2">
            <input type="hidden" name="load_id" value={loadId} />
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Save template
            </label>
            <input
              name="name"
              placeholder="Template name"
              className="mb-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button className="menu-item w-full px-0 text-left" type="submit">
              Save as template
            </button>
          </form>
          <StatusAction
            loadId={loadId}
            status="completed"
            label="Archive This Load"
            returnTo={returnTo}
            disabled={status === "completed" || status === "cancelled"}
          />
          <StatusAction
            loadId={loadId}
            status="cancelled"
            label="Cancel This Load"
            returnTo={returnTo}
            disabled={status === "cancelled"}
          />
        </ActionMenu>
        </div>
      </div>
      ) : null}

      {smsNotice ? (
        <p
          className={`mx-3 mb-3 rounded-md px-3 py-2 text-sm ${
            smsNotice.tone === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-800"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
          role="status"
        >
          {smsNotice.text}
        </p>
      ) : null}

      {dispatchOpen ? (
        <div className="pay-item-dialog-backdrop" role="dialog" aria-label="Text dispatch to driver">
          <div className="pay-item-dialog card space-y-3 p-5">
            <h3 className="text-sm font-semibold">Text dispatch to driver</h3>
            <p className="text-sm text-slate-600">
              Send this load confirmation to {driverPhone} (driver mobile on the load).
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
              {loadSummary}
            </pre>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" type="button" onClick={() => setDispatchOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={smsPending}
                onClick={() => void sendSms("load_info")}
              >
                {smsPending ? "Sending…" : "Send text"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={smsPending}
                onClick={() => {
                  if (!requireDriverPhone("whatsapp")) return;
                  void sendWhatsApp("load_info");
                }}
              >
                {smsPending ? "Sending…" : "Send WhatsApp"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={smsPending}
                onClick={async () => {
                  if (!driverEmail.trim()) {
                    setSmsNotice({ tone: "error", text: "This driver has no email on the driver record." });
                    return;
                  }
                  if (!window.confirm(`Send load information to ${driverEmail}?`)) return;
                  setSmsPending(true);
                  const form = new FormData();
                  form.set("load_id", String(loadId));
                  form.set("kind", "driver_load");
                  const result = await sendLoadMailAction(form);
                  setSmsPending(false);
                  if (!result.ok) {
                    setSmsNotice({ tone: "error", text: result.error });
                    return;
                  }
                  setSmsNotice({ tone: "ok", text: result.message ?? "Sent." });
                  setDispatchOpen(false);
                  router.refresh();
                }}
              >
                {smsPending ? "Sending…" : "Email driver load"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        onInput={(event) => {
          if ((event.target as HTMLElement | null)?.closest?.("[data-ignore-dirty]")) return;
          setDirty(true);
        }}
        onChange={(event) => {
          if ((event.target as HTMLElement | null)?.closest?.("[data-ignore-dirty]")) return;
          if ((event.target as HTMLElement | null)?.closest?.("[data-first-assign]")) return;
          setDirty(true);
        }}
      >
        {children}
      </div>
    </LoadEditProvider>
  );
}

function ActionMenu({
  label,
  openMenu,
  setOpenMenu,
  children,
}: {
  label: string;
  openMenu: string | null;
  setOpenMenu: (label: string | null) => void;
  children: React.ReactNode;
}) {
  const open = openMenu === label;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpenMenu(null), rootRef, menuRef);
  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpenMenu(label)}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <button
        type="button"
        className="btn load-action-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpenMenu(open ? null : label)}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="load-action-menu absolute z-20 mt-1 min-w-56 rounded-lg py-1 shadow-lg"
          role="menu"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuAction({
  label,
  disabled,
  run,
}: {
  label: string;
  disabled?: boolean;
  run: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="menu-item w-full text-left disabled:opacity-50"
      disabled={disabled}
      onClick={async () => {
        if (disabled) return;
        const result = await run();
        if (!result.ok) {
          window.alert(result.error);
          return;
        }
        if (result.message) window.alert(result.message);
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}

function StatusAction({
  loadId,
  status,
  label,
  returnTo,
  disabled,
}: {
  loadId: number;
  status: string;
  label: string;
  returnTo: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="menu-item w-full text-left disabled:opacity-50"
      disabled={disabled}
      onClick={async () => {
        if (disabled) return;
        if (!window.confirm(`${label}?`)) return;
        const formData = new FormData();
        formData.set("load_id", String(loadId));
        formData.set("status", status);
        formData.set("return_to", returnTo);
        const result = await updateLoadStatusAction(formData);
        if (!result.ok) {
          window.alert(result.error);
          return;
        }
        if (status === "cancelled") {
          router.push(returnTo);
          return;
        }
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
