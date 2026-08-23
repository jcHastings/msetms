"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { LoadEditProvider } from "@/components/load-edit-context";
import { cloneLoadAction } from "@/lib/dispatcher-actions";
import { updateLoadStatusAction } from "@/lib/actions";
import { LOAD_TABS, parseLoadTab, type LoadTab } from "@/lib/load-tabs";

export function LoadWorkspace({
  loadId,
  loadNumber,
  status,
  initialTab,
  children,
}: {
  loadId: number;
  loadNumber: string;
  status: string;
  initialTab: string;
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

  const setTab = useCallback((next: LoadTab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}?${url.searchParams.toString()}`);
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

  return (
    <LoadEditProvider
      value={{ tab, setTab, dirty, markDirty, clearDirty, formId, canSubmit, pending, setSubmitState }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <nav className="flex flex-wrap gap-1" aria-label="Load tabs">
          {LOAD_TABS.map((item) => (
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
          <button type="button" className="menu-item" onClick={() => setTab("log")}>
            View load log
          </button>
        </ActionMenu>
        <ActionMenu label="Dispatch and Tracking">
          <button type="button" className="menu-item" onClick={() => setTab("assets")}>
            Tracking and status
          </button>
        </ActionMenu>
        <ActionMenu label="Load Documents">
          <button type="button" className="menu-item" onClick={() => setTab("docs")}>
            View load documents
          </button>
        </ActionMenu>
        <ActionMenu label="Copy / Cancel / Archive">
          <form action={cloneLoadAction}>
            <input type="hidden" name="load_id" value={loadId} />
            <button className="menu-item w-full text-left" type="submit">
              Copy this load
            </button>
          </form>
          <StatusAction loadId={loadId} status="cancelled" label="Cancel this load" disabled={status === "cancelled"} />
          <StatusAction
            loadId={loadId}
            status="completed"
            label="Archive this load"
            disabled={status === "completed" || status === "cancelled"}
          />
        </ActionMenu>
        <Link href={`/audit?load=${encodeURIComponent(loadNumber)}`} className="text-xs text-slate-500 hover:underline">
          Company audit
        </Link>
      </div>

      <div
        onInput={() => setDirty(true)}
        onChange={() => setDirty(true)}
      >
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
      <div className="absolute z-20 mt-1 min-w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
        {children}
      </div>
    </details>
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
