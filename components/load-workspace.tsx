"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useDismissable } from "@/components/use-dismissable";
import { createHoverMenuCloser } from "@/lib/hover-menu";
import { DocumentPreviewProvider } from "@/components/document-preview";
import { closeLoadOverlay } from "@/components/page-overlay-host";
import { LoadEditProvider } from "@/components/load-edit-context";
import {
  assignLoadDispatcherAction,
  cloneLoadAction,
  requestDriverDocumentsAction,
  requestPodAction,
  saveTemplateAction,
  setMasterLoadAction,
  sendLoadSmsAction,
  sendLoadWhatsAppAction,
  watchLoadAction,
} from "@/lib/dispatcher-actions";
import { EmailCustomerUpdateButton, LoadMailMenuItems } from "@/components/load-mail-panel";
import { updateLoadAction, updateLoadStatusAction } from "@/lib/actions";
import { everydayFieldsFromForm } from "@/lib/load-autosave-shared";
import { SMS_MISSING_KEYS } from "@/lib/sms-shared";
import { WHATSAPP_MISSING } from "@/lib/whatsapp-shared";
import { isFormTab, isSaveTab, loadFormTabsForRole, parseLoadTab, type LoadTab } from "@/lib/load-tabs";
import {
  canAssignLoads,
  canEmailInvoice,
  canLogCheckCall,
  canSendSms,
  canViewAudit,
  canViewLoadFinancials,
} from "@/lib/settings-shared";
import { driverLoadGreeting, type DriverMessageLocale } from "@/lib/load-summary";

export function LoadWorkspace({
  loadId,
  status,
  initialTab,
  loadSummary,
  loadSummaryEs = "",
  driverName = "",
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
  header,
  children,
}: {
  loadId: number | null;
  status: string;
  initialTab: string;
  loadSummary: string;
  loadSummaryEs?: string;
  driverName?: string;
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
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const formId = useId().replace(/:/g, "") + "-load-form";
  const [tab, setTabState] = useState<LoadTab>(() => parseLoadTab(initialTab));
  const [dirty, setDirty] = useState(false);
  const [canSubmit, setCanSubmit] = useState(true);
  const [pending, setPending] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuCloser = useMemo(() => createHoverMenuCloser(), []);
  useEffect(() => () => menuCloser.dispose(), [menuCloser]);
  const [smsNotice, setSmsNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [smsPending, setSmsPending] = useState(false);
  const [driverLocale, setDriverLocale] = useState<DriverMessageLocale>("en");
  const dispatchPreview = `${driverLoadGreeting({ locale: driverLocale, driverName })}\n\n${
    driverLocale === "es" ? loadSummaryEs || loadSummary : loadSummary
  }`.trim();
  const markDirty = useCallback(() => setDirty(true), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  const setSubmitState = useCallback((state: { canSubmit: boolean; pending: boolean }) => {
    setCanSubmit(state.canSubmit);
    setPending(state.pending);
  }, []);

  const captureEverydayFields = useCallback((): Record<string, string> => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return {};
    return everydayFieldsFromForm(form);
  }, [formId]);

  const persistEverydayFields = useCallback(
    async (fields: Record<string, string>) => {
      if (!loadId || !Object.keys(fields).length) return true;
      const formData = new FormData();
      formData.set("stay_on_load", "1");
      formData.set("skip_route_refresh", "1");
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      const result = await updateLoadAction(loadId, null, formData);
      if (result && !result.ok) {
        window.alert(result.error);
        return false;
      }
      return true;
    },
    [loadId],
  );

  const flushEverydayFields = useCallback(async () => {
    return persistEverydayFields(captureEverydayFields());
  }, [captureEverydayFields, persistEverydayFields]);

  const setTab = useCallback(
    (next: LoadTab, hash?: string) => {
      if (tab !== next) {
        if (dirty && isFormTab(tab)) {
          if (!window.confirm("You have unsaved changes on this screen. Switch anyway?")) return;
          setDirty(false);
        }
        void flushEverydayFields();
      }
      setTabState(next);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      url.hash = hash ? hash.replace(/^#/, "") : "";
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}?${url.searchParams.toString()}${url.hash ? `#${url.hash}` : ""}`,
      );
      if (hash) {
        window.setTimeout(() => document.getElementById(hash.replace(/^#/, ""))?.scrollIntoView({ block: "start" }), 0);
      }
    },
    [dirty, flushEverydayFields, tab],
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
    const fields = captureEverydayFields();
    const embed = new URLSearchParams(window.location.search).get("embed") === "1";
    if (embed && window.parent !== window) {
      window.parent.postMessage({ type: "ms-close-load" }, window.location.origin);
    } else if (new URL(window.location.href).searchParams.has("open")) {
      closeLoadOverlay(href);
    } else {
      router.push(href);
    }
    void persistEverydayFields(fields);
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
    formData.set("locale", driverLocale);
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
    formData.set("locale", driverLocale);
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
    <DocumentPreviewProvider>
    <div className="load-workspace">
      {header}
      <div className="load-tabs mb-2 flex flex-wrap items-center justify-between gap-1 px-2 pt-1">
        {create ? (
          <p className="px-2 py-1 text-[12.5px] font-semibold text-slate-600">New load</p>
        ) : (
          <nav className="flex flex-wrap gap-0.5" aria-label="Load tabs">
            {loadFormTabsForRole(role).map((item) => (
              <button
                key={item.value}
                type="button"
                className={`load-tab rounded-t px-2 py-1 text-[12.5px] font-semibold ${
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
      <div className="load-actions mb-2 px-2 py-1.5">
        <div className="load-actions-label mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]">Load Actions</div>
        <div className="flex flex-wrap items-center gap-1">
        {canSendSms(role) && tab !== "docs" ? (
          <button
            type="button"
            className="btn load-action-btn"
            data-text-dispatch=""
            onClick={() => {
              if (!requireDriverPhone()) return;
              setSmsNotice(null);
              setDispatchOpen(true);
            }}
          >
            Text dispatch to driver
          </button>
        ) : null}
        {canSendSms(role) && whatsappConfigured && tab !== "docs" ? (
          <button
            type="button"
            className="btn load-action-btn"
            data-whatsapp-load=""
            onClick={() => {
              if (!requireDriverPhone("whatsapp")) return;
              setSmsNotice(null);
              setDispatchOpen(true);
            }}
          >
            WhatsApp load
          </button>
        ) : null}
        {canSendSms(role) && loadId ? (
          <EmailCustomerUpdateButton
            loadId={loadId}
            loadNumber={loadNumber}
            customerEmail={contactEmail}
            onNotice={setSmsNotice}
            appearance="action"
          />
        ) : null}
        {canEmailInvoice(role) && loadId ? (
          <button
            type="button"
            className="btn load-action-btn"
            data-email-invoice-action=""
            onClick={() => setTab("financials", "email-invoice")}
          >
            Email invoice
          </button>
        ) : null}
        <ActionMenu label="Load Log" openMenu={openMenu} setOpenMenu={setOpenMenu} closer={menuCloser}>
          {canLogCheckCall(role) ? (
            <button type="button" className="menu-item" onClick={() => setTab("log", "load-check-call")}>
              Log Check Call
            </button>
          ) : null}
          <button type="button" className="menu-item" onClick={() => setTab("log", "load-log")}>
            View Load Log
          </button>
        </ActionMenu>
        <ActionMenu label="Dispatch and Tracking" openMenu={openMenu} setOpenMenu={setOpenMenu} closer={menuCloser}>
          <button type="button" className="menu-item" onClick={() => setTab("log", "load-map")}>
            Load map
          </button>
          <button type="button" className="menu-item" onClick={() => setTab("log")}>
            Tracking and status
          </button>
          {canSendSms(role) && loadId ? (
            <EmailCustomerUpdateButton
              loadId={loadId}
              loadNumber={loadNumber}
              customerEmail={contactEmail}
              onNotice={setSmsNotice}
              appearance="menu"
            />
          ) : null}
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
              {whatsappConfigured ? (
              <button
                type="button"
                className="menu-item"
                data-whatsapp-message=""
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
              ) : null}
            </>
          ) : null}
        </ActionMenu>
        <ActionMenu label="Load Documents" openMenu={openMenu} setOpenMenu={setOpenMenu} closer={menuCloser}>
          <button type="button" className="menu-item" onClick={() => setTab("docs", "defaulted-documents")}>
            Your defaulted documents
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
          {canEmailInvoice(role) && loadId ? (
            <button
              type="button"
              className="menu-item w-full text-left"
              data-email-invoice-menu=""
              onClick={() => setTab("financials", "email-invoice")}
            >
              Email invoice
            </button>
          ) : null}
        </ActionMenu>
        {canViewLoadFinancials(role) || canViewAudit(role) || canAssignLoads(role) ? (
        <ActionMenu label="Admin / Financials" openMenu={openMenu} setOpenMenu={setOpenMenu} closer={menuCloser}>
          {canEmailInvoice(role) && loadId ? (
            <button
              type="button"
              className="menu-item w-full text-left"
              data-email-invoice-menu=""
              onClick={() => setTab("financials", "email-invoice")}
            >
              Email invoice
            </button>
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
        <ActionMenu label="Copy / Cancel / Archive" openMenu={openMenu} setOpenMenu={setOpenMenu} closer={menuCloser}>
          <button
            type="button"
            className="menu-item w-full text-left"
            onClick={async () => {
              if (!loadId) return;
              const form = new FormData();
              form.set("load_id", String(loadId));
              form.set("is_master", "1");
              const result = await setMasterLoadAction(form);
              if (!result.ok) {
                window.alert(result.error);
                return;
              }
              setTab("stops", "master-load");
            }}
          >
            Use multiple customers (Master Load)
          </button>
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
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="sr-only">Language</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="driver-locale"
                  checked={driverLocale === "en"}
                  onChange={() => setDriverLocale("en")}
                />
                English
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="driver-locale"
                  checked={driverLocale === "es"}
                  onChange={() => setDriverLocale("es")}
                />
                Spanish
              </label>
            </fieldset>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
              {dispatchPreview}
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
              {whatsappConfigured ? (
              <button
                className="btn btn-secondary"
                type="button"
                disabled={smsPending}
                data-whatsapp-send=""
                onClick={() => {
                  if (!requireDriverPhone("whatsapp")) return;
                  void sendWhatsApp("load_info");
                }}
              >
                {smsPending ? "Sending…" : "Send WhatsApp"}
              </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        onInput={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest?.("[data-ignore-dirty]")) return;
          if (target?.closest?.("[data-autosave]")) return;
          setDirty(true);
        }}
        onChange={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest?.("[data-ignore-dirty]")) return;
          if (target?.closest?.("[data-autosave]")) return;
          if (target?.closest?.("[data-first-assign]")) return;
          setDirty(true);
        }}
      >
        {children}
      </div>
    </div>
    </DocumentPreviewProvider>
    </LoadEditProvider>
  );
}

function ActionMenu({
  label,
  openMenu,
  setOpenMenu,
  closer,
  children,
}: {
  label: string;
  openMenu: string | null;
  setOpenMenu: (label: string | null) => void;
  closer: ReturnType<typeof createHoverMenuCloser>;
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
      data-hover-action-menu=""
      onMouseEnter={() => {
        closer.cancel();
        setOpenMenu(label);
      }}
      onMouseLeave={() => closer.schedule(() => setOpenMenu(null))}
    >
      <button
        type="button"
        className="btn load-action-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          closer.cancel();
          setOpenMenu(open ? null : label);
        }}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="absolute z-20 min-w-56 pt-1 top-full left-0"
          role="menu"
          onMouseEnter={() => closer.cancel()}
          onMouseLeave={() => closer.schedule(() => setOpenMenu(null))}
        >
          <div className="absolute inset-x-0 -top-2 h-2" aria-hidden data-hover-menu-bridge="" />
          <div className="load-action-menu rounded-lg py-1 shadow-lg">{children}</div>
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
