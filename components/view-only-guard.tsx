"use client";

import { useEffect } from "react";

const TITLE = "View-only access";

const CONTROL =
  "button, a.btn-primary, select, textarea, input:not([type='hidden']), input[type='file']";

function allowed(el: Element): boolean {
  if (el.closest("[data-view-only-lock]")) return false;
  if (el.closest("[data-view-only-allow], [data-mike-composer]")) return true;
  return false;
}

function isReadDownload(el: HTMLElement): boolean {
  const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("download") ?? ""}`;
  return /download|export|spreadsheet|excel/i.test(label);
}

function shouldLock(el: HTMLElement): boolean {
  if (el.closest("[data-view-only-lock]")) return true;
  if (allowed(el)) return false;
  if (el.closest("form[method='get' i]")) return false;
  if (el.matches("[data-load-overlay-close], .load-tab, .desk-nav-parent, .desk-phone-menu, .office-bell-button")) {
    return false;
  }
  if (isReadDownload(el)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "hidden") return false;
    return true;
  }
  if (el instanceof HTMLAnchorElement && el.classList.contains("btn-primary")) return true;
  if (el instanceof HTMLButtonElement) return true;
  return false;
}

function lock(el: HTMLElement): void {
  const disables =
    el instanceof HTMLButtonElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement;
  if (
    el.getAttribute("data-view-only-locked") === "true" &&
    el.getAttribute("aria-disabled") === "true" &&
    (!disables || el.disabled)
  ) {
    return;
  }
  el.setAttribute("aria-disabled", "true");
  el.setAttribute("data-view-only-locked", "true");
  if (!el.getAttribute("title")) el.setAttribute("title", TITLE);
  if (disables) el.disabled = true;
  if (el instanceof HTMLAnchorElement) el.tabIndex = -1;
}

/** True when the signed-in office user is a viewer. New forms can read this; the guard covers the rest. */
export function useOfficeViewer(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.officeViewer === "true";
}

export function ViewOnlyGuard({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.body;

    function scan(scope: ParentNode) {
      scope.querySelectorAll(CONTROL).forEach((node) => {
        if (node instanceof HTMLElement && shouldLock(node)) lock(node);
      });
    }

    function onIntent(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(CONTROL);
      if (!(control instanceof HTMLElement) || !shouldLock(control)) return;
      lock(control);
      event.preventDefault();
      event.stopPropagation();
    }

    let scanning = false;
    function safeScan(scope: ParentNode) {
      if (scanning) return;
      scanning = true;
      try {
        scan(scope);
      } finally {
        scanning = false;
      }
    }

    safeScan(root);
    const observer = new MutationObserver(() => safeScan(root));
    observer.observe(root, { childList: true, subtree: true });
    const again = window.setTimeout(() => safeScan(root), 400);
    const later = window.setTimeout(() => safeScan(root), 1200);
    root.addEventListener("click", onIntent, true);
    root.addEventListener("submit", onIntent, true);
    root.addEventListener("change", onIntent, true);
    root.addEventListener("keydown", onIntent, true);
    return () => {
      window.clearTimeout(again);
      window.clearTimeout(later);
      observer.disconnect();
      root.removeEventListener("click", onIntent, true);
      root.removeEventListener("submit", onIntent, true);
      root.removeEventListener("change", onIntent, true);
      root.removeEventListener("keydown", onIntent, true);
    };
  }, [enabled]);

  return null;
}
