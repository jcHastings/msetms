"use client";

import { useEffect } from "react";

const TITLE = "View-only access";

function allowed(el: Element): boolean {
  if (el.closest("[data-view-only-lock]")) return false;
  if (el.closest("[data-view-only-allow]")) return true;
  return false;
}

function shouldLock(el: HTMLElement): boolean {
  if (el.closest("[data-view-only-lock]")) return true;
  if (allowed(el)) return false;
  if (el.closest("form[method='get' i]")) return false;
  if (el.matches("[data-load-overlay-close], .load-tab, .desk-nav-parent, .desk-phone-menu, .office-bell-button")) {
    return false;
  }
  if (el instanceof HTMLSelectElement && el.getAttribute("aria-label") === "Load status") return true;
  if (el instanceof HTMLAnchorElement && el.classList.contains("btn-primary")) return true;
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (el.classList.contains("menu-item")) return true;
    if (el.classList.contains("btn-primary")) return true;
    if (type === "submit" || (el instanceof HTMLButtonElement && type === "")) return true;
    if (el.classList.contains("acct-link") && el.closest("form")) return true;
  }
  return false;
}

function lock(el: HTMLElement): void {
  el.setAttribute("aria-disabled", "true");
  el.setAttribute("data-view-only-locked", "true");
  if (!el.getAttribute("title")) el.setAttribute("title", TITLE);
  if (el instanceof HTMLButtonElement || el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
    el.disabled = true;
  }
  if (el instanceof HTMLAnchorElement) {
    el.tabIndex = -1;
  }
}

export function ViewOnlyGuard({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.body;

    function scan(scope: ParentNode) {
      scope.querySelectorAll("button, a.btn-primary, select, input[type='submit']").forEach((node) => {
        if (node instanceof HTMLElement && shouldLock(node)) lock(node);
      });
    }

    function onIntent(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("button, a.btn-primary, select, input[type='submit']");
      if (!(control instanceof HTMLElement) || !shouldLock(control)) return;
      lock(control);
      event.preventDefault();
      event.stopPropagation();
    }

    scan(root);
    const observer = new MutationObserver(() => scan(root));
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("click", onIntent, true);
    root.addEventListener("submit", onIntent, true);
    root.addEventListener("change", onIntent, true);
    return () => {
      observer.disconnect();
      root.removeEventListener("click", onIntent, true);
      root.removeEventListener("submit", onIntent, true);
      root.removeEventListener("change", onIntent, true);
    };
  }, [enabled]);

  return null;
}
