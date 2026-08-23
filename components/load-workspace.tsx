"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { LoadEditProvider } from "@/components/load-edit-context";
import {
  assignLoadDispatcherAction,
  cloneLoadAction,
  requestDriverDocumentsAction,
  sendLoadSmsAction,
  sendToAccountingAction,
} from "@/lib/dispatcher-actions";
import { updateLoadStatusAction } from "@/lib/actions";
import { SMS_MISSING_KEYS } from "@/lib/sms-shared";
import { loadFormTabsForRole, parseLoadTab, type LoadTab } from "@/lib/load-tabs";
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
  role,
  children,
}: {
  loadId: number;
  status: string;
  initialTab: string;
  loadSummary: string;
  driverAssigned: boolean;
  driverPhone: string;
  dispatcherId: number | null;
  dispatchers: Array<{ id: number; name: string }>;
  docsRequested: boolean;
  smsConfigured: boolean;
  role: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const formId = useId().replace(/:/g, "") + "-load-form";
  const [tab, setTabState] = useState<LoadTab>(() => {
    if (typeof window !== "undefined") {
      return parseLoadTab(new URLSearchParams(window.location.search).get("tab"));
    }
    return parseLoadTab(initialTab);
  });
  const [dirty, setDirty] = useState(false);
  const [canSubmit, setCanSubmit] = useState(true);
  const [pending, setPending] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  const setSubmitState = useCallback((state: { canSubmit: boolean; pending: boolean }) => {
    setCanSubmit(state.canSubmit);
    setPending(state.pending);
  }, []);

  const setTab = useCallback((next: LoadTab, hash?: string) => {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.hash = hash ? hash.replace(/^#/, "") : "";
    window.history.replaceState(window.history.state, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
    if (hash) {
      window.setTimeout(() => document.getElementById(hash.replace(/^#/, ""))?.scrollIntoView({ block: "start" }), 0);
    }
  }, []);

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
    router.push(href);
  }

  function requireDriverPhone(): boolean {
    if (!smsConfigured) {
      window.alert(SMS_MISSING_KEYS);
      return false;
    }
    if (!driverAssigned) {
      window.alert("Assign a driver first.");
      return false;
    }
    if (!driverPhone.trim()) {
      window.alert("The assigned driver needs a mobile number.");
      return false;
    }
    return true;
  }

  async function sendSms(kind: "message" | "load_info", body?: string) {
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("kind", kind);
    if (body) formData.set("body", body);
    const result = await sendLoadSmsAction(formData);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    window.alert(result.message ?? "Text sent.");
    router.refresh();
  }

  return (
    <LoadEditProvider
      value={{ tab, setTab, dirty, markDirty, clearDirty, formId, canSubmit, pending, setSubmitState }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <nav className="flex flex-wrap gap-1" aria-label="Load tabs">
          {loadFormTabsForRole(role).map((item) => (
            <button
              key={item.value}
              type="button"
              className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                tab === item.value
                  ? "bg-white text-navy shadow-inner ring-1 ring-slate-200"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
              aria-current={tab === item.value ? "page" : undefined}
              onClick={() => setTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button className="btn btn-primary" type="submit" form={formId} disabled={!canSubmit}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => confirmLeave("/board")}>
            Back to board
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Load Actions</span>
        <ActionMenu label="Load Log">
          {canLogCheckCall(role) ? (
            <button type="button" className="menu-item" onClick={() => setTab("log", "load-check-call")}>
              Log Check Call
            </button>
          ) : null}
          <button type="button" className="menu-item" onClick={() => setTab("log", "load-log")}>
            View Load Log
          </button>
        </ActionMenu>
        <ActionMenu label="Dispatch and Tracking">
          <button type="button" className="menu-item" onClick={() => setTab("assets")}>
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
                  if (!requireDriverPhone()) return;
                  if (!window.confirm(`Text this load information to ${driverPhone}?\n\n${loadSummary}`)) return;
                  void sendSms("load_info");
                }}
              >
                Text Load Information
              </button>
            </>
          ) : null}
        </ActionMenu>
        <ActionMenu label="Load Documents">
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
        </ActionMenu>
        {canViewLoadFinancials(role) || canViewAudit(role) || canAssignLoads(role) ? (
        <ActionMenu label="Admin / Financials">
          {canViewLoadFinancials(role) ? (
            <MenuAction
              label="Send to Accounting"
              run={async () => {
                const formData = new FormData();
                formData.set("load_id", String(loadId));
                return sendToAccountingAction(formData);
              }}
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
        <ActionMenu label="Copy / Cancel / Archive">
          <form action={cloneLoadAction}>
            <input type="hidden" name="load_id" value={loadId} />
            <button className="menu-item w-full text-left" type="submit">
              Copy This Load
            </button>
          </form>
          <StatusAction
            loadId={loadId}
            status="completed"
            label="Archive This Load"
            disabled={status === "completed" || status === "cancelled"}
          />
          <StatusAction loadId={loadId} status="cancelled" label="Cancel This Load" disabled={status === "cancelled"} />
        </ActionMenu>
      </div>

      <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
        {children}
      </div>
    </LoadEditProvider>
  );
}

function ActionMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary className="btn btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="absolute z-20 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
        {children}
      </div>
    </details>
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
  disabled,
}: {
  loadId: number;
  status: string;
  label: string;
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
        const result = await updateLoadStatusAction(formData);
        if (!result.ok) {
          window.alert(result.error);
          return;
        }
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
