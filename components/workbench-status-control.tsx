"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { offerInvoicePrompt } from "@/components/invoice-send-prompt";
import { updateLoadStatusAction } from "@/lib/actions";
import { loadStatusBadgeClass } from "@/lib/load-status-style";
import { labelForLoadStatus } from "@/lib/types";

type StatusChoice = { value: string; label: string };

type MenuBox = { top: number; left: number; width: number; maxHeight?: number };

const MENU_GAP = 4;
const VIEWPORT_PAD = 8;

function sameMenuBox(prev: MenuBox | null, next: MenuBox): boolean {
  return (
    !!prev &&
    prev.top === next.top &&
    prev.left === next.left &&
    prev.width === next.width &&
    prev.maxHeight === next.maxHeight
  );
}

/** Place the fixed menu under the badge, or above it, and clamp only when neither side fits. */
function computeMenuBox(button: HTMLButtonElement, menu: HTMLUListElement | null): MenuBox {
  const rect = button.getBoundingClientRect();
  const width = Math.max(rect.width, 148);
  let left = rect.left;
  const maxLeft = window.innerWidth - VIEWPORT_PAD - width;
  if (left > maxLeft) left = Math.max(VIEWPORT_PAD, maxLeft);

  const borderY = menu ? menu.offsetHeight - menu.clientHeight : 0;
  const natural = menu ? menu.scrollHeight + borderY : 0;
  const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PAD;
  const spaceAbove = rect.top - MENU_GAP - VIEWPORT_PAD;
  let top = rect.bottom + MENU_GAP;
  let maxHeight: number | undefined;

  if (natural > spaceBelow + 1) {
    if (natural <= spaceAbove + 1) {
      top = rect.top - MENU_GAP - natural;
    } else if (spaceAbove > spaceBelow) {
      maxHeight = Math.max(0, spaceAbove);
      top = Math.max(VIEWPORT_PAD, rect.top - MENU_GAP - maxHeight);
    } else {
      maxHeight = Math.max(0, spaceBelow);
      if (top + maxHeight > window.innerHeight - VIEWPORT_PAD) {
        maxHeight = Math.max(0, window.innerHeight - VIEWPORT_PAD - top);
      }
    }
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(width),
    maxHeight: maxHeight == null ? undefined : Math.round(maxHeight),
  };
}

function isRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}

export function WorkbenchStatusControl({
  loadId,
  loadNumber,
  status,
  options,
}: {
  loadId: number;
  loadNumber: string;
  status: string;
  options: StatusChoice[];
}) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const pendingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<MenuBox | null>(null);
  const [anchorWidth, setAnchorWidth] = useState(148);
  if (optimistic && status === optimistic) setOptimistic(null);
  const shown = optimistic ?? status;
  const moves = options.filter((item) => item.value !== shown);
  const label = `Change status for load ${loadNumber}`;

  const syncMenuBox = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const next = computeMenuBox(button, menuRef.current);
    setMenuBox((prev) => (sameMenuBox(prev, next) ? prev : next));
  }, []);

  const assignMenu = useCallback((node: HTMLUListElement | null) => {
    menuRef.current = node;
    if (!node) return;
    syncMenuBox();
  }, [syncMenuBox]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuBox(null);
  }, []);

  const openMenu = useCallback((index: number) => {
    const width = Math.round(Math.max(buttonRef.current?.getBoundingClientRect().width ?? 0, 148));
    setAnchorWidth(width);
    setMenuBox(null);
    setActiveIndex(index);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      closeMenu();
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", syncMenuBox);
    window.addEventListener("scroll", syncMenuBox, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", syncMenuBox);
      window.removeEventListener("scroll", syncMenuBox, true);
    };
  }, [open, syncMenuBox, closeMenu]);

  useEffect(() => {
    if (!open || menuBox?.maxHeight == null) return;
    const option = menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    option?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, menuBox?.maxHeight]);

  function stopCardOpen(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  async function choose(next: string) {
    if (pendingRef.current || next === shown) return;
    const previous = shown;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    closeMenu();
    setOptimistic(next);
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("status", next);
    formData.set("return_to", "/");
    try {
      const result = await updateLoadStatusAction(formData);
      if (!result.ok) {
        setOptimistic(previous === status ? null : previous);
        setError(result.error);
        return;
      }
      offerInvoicePrompt(result);
      router.refresh();
    } catch (caught) {
      if (isRedirectError(caught)) throw caught;
      setOptimistic(previous === status ? null : previous);
      setError("Status did not save. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (pendingRef.current) {
      event.preventDefault();
      return;
    }
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu(event.key === "ArrowUp" ? Math.max(moves.length - 1, 0) : 0);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (moves.length === 0 ? 0 : (index + 1) % moves.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (moves.length === 0 ? 0 : (index - 1 + moves.length) % moves.length));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const next = moves[activeIndex];
      if (next) void choose(next.value);
      return;
    }
    if (event.key === "Tab") closeMenu();
  }

  const menu =
    open
      ? createPortal(
          <ul
            ref={assignMenu}
            id={listId}
            role="listbox"
            aria-label={label}
            data-workbench-status-menu=""
            data-clamp={menuBox?.maxHeight == null ? undefined : "true"}
            className="workbench-status-menu"
            style={
              menuBox
                ? {
                    top: menuBox.top,
                    left: menuBox.left,
                    width: menuBox.width,
                    maxHeight: menuBox.maxHeight,
                  }
                : { top: 0, left: 0, width: anchorWidth, visibility: "hidden" }
            }
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {moves.length === 0 ? (
              <li className="px-2 py-1 text-xs text-slate-500">No other status</li>
            ) : (
              moves.map((item, index) => (
                <li key={item.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-${item.value}`}
                    data-index={index}
                    data-workbench-status-option={item.value}
                    aria-selected={index === activeIndex}
                    className="workbench-status-option"
                    data-active={index === activeIndex ? "true" : "false"}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void choose(item.value);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className="min-w-0"
      data-workbench-status-wrap=""
      onClick={stopCardOpen}
      onPointerDown={stopCardOpen}
      onKeyDown={stopCardOpen}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`workbench-status-control ${loadStatusBadgeClass(shown)}`}
        data-workbench-status=""
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && moves[activeIndex] ? `${listId}-${moves[activeIndex].value}` : undefined}
        aria-label={label}
        title="Change status"
        aria-busy={pending}
        disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pendingRef.current) return;
          if (open) closeMenu();
          else openMenu(0);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="workbench-status-label">{labelForLoadStatus(shown)}</span>
        <svg className="workbench-status-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path
            d="M2.25 4.5 6 8.25 9.75 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {error ? (
        <p className="mt-0.5 text-[11px] leading-4 text-rose-700" role="alert" data-workbench-status-error="">
          {error}
        </p>
      ) : null}
      {menu}
    </div>
  );
}
