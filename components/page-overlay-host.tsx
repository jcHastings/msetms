"use client";

import { useEffect, useState, type ReactNode } from "react";
import { parseOpenLoadId } from "@/lib/load-page-shared";

const OPEN_EVENT = "ms-open-load";

export function requestLoadOverlay(href: string): void {
  const url = new URL(href, window.location.origin);
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function closeLoadOverlay(returnTo: string): void {
  const url = new URL(returnTo, window.location.origin);
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function openIdFromLocation(): number | null {
  return parseOpenLoadId(new URL(window.location.href).searchParams.get("open") ?? undefined);
}

export function PageOverlayHost({
  children,
  returnTo,
  serverOpenId = null,
}: {
  children: ReactNode;
  returnTo: string;
  serverOpenId?: number | null;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = openIdFromLocation();
      setOpenId(next);
      setLoaded(false);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener(OPEN_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(OPEN_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "ms-close-load") return;
      closeLoadOverlay(returnTo);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const current = openIdFromLocation();
      if (!current || current === serverOpenId) return;
      closeLoadOverlay(returnTo);
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
    };
  }, [returnTo, serverOpenId]);

  const frameId = openId && openId !== serverOpenId ? openId : null;
  const src = frameId
    ? `/loads/${frameId}?from=${encodeURIComponent(returnTo)}&embed=1`
    : "";

  return (
    <>
      {children}
      {frameId ? (
        <div className="load-overlay-backdrop" role="dialog" aria-label="Edit load">
          <div className="load-overlay-panel overflow-hidden p-0">
            {loaded ? null : <p className="px-5 py-6 text-sm text-slate-700">Opening…</p>}
            <iframe
              title="Edit load"
              src={src}
              className={`min-h-[80vh] w-full border-0 ${loaded ? "" : "sr-only"}`}
              onLoad={() => setLoaded(true)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
