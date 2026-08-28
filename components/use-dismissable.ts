"use client";

import { useEffect, useRef, type RefObject } from "react";

const MENU_CONTROL = "a, button, input, select, textarea, label, form";

let activeOverflowClose: (() => void) | null = null;

/** Only one overflow menu stays open; opening another closes the first. */
export function claimOverflowMenu(close: () => void): () => void {
  if (activeOverflowClose && activeOverflowClose !== close) activeOverflowClose();
  activeOverflowClose = close;
  return () => {
    if (activeOverflowClose === close) activeOverflowClose = null;
  };
}

function isMenuControl(target: Node | null): boolean {
  const el = target instanceof Element ? target : target?.parentElement;
  return Boolean(el?.closest(MENU_CONTROL));
}

function swallowNextClick(): void {
  function suppressClick(click: MouseEvent) {
    click.stopPropagation();
    click.preventDefault();
    cleanup();
  }
  function cleanup() {
    document.removeEventListener("click", suppressClick, true);
    window.clearTimeout(timer);
  }
  const timer = window.setTimeout(cleanup, 400);
  document.addEventListener("click", suppressClick, true);
}

/** Close a menu or popover on outside pointer or Escape. Clicks on controls inside stay. */
export function useDismissable(
  open: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLElement | null>,
  extraRef?: RefObject<HTMLElement | null>,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const extraRefHeld = useRef(extraRef);
  extraRefHeld.current = extraRef;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      const extra = extraRefHeld.current?.current;
      if (target && extra?.contains(target) && isMenuControl(target)) return;
      onCloseRef.current();
      const el = target instanceof Element ? target : target?.parentElement;
      if (el?.closest("[data-row-overflow-trigger], .row-actions-btn")) return;
      event.stopPropagation();
      swallowNextClick();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, rootRef]);
}
