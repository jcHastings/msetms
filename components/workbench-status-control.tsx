"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { updateLoadStatusAction } from "@/lib/actions";
import { loadStatusBadgeClass } from "@/lib/load-status-style";
import { labelForLoadStatus } from "@/lib/types";

type StatusChoice = { value: string; label: string };

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
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const shown = optimistic ?? status;
  const moves = options.filter((item) => item.value !== shown);
  const label = `Change status for load ${loadNumber}`;

  useEffect(() => {
    if (optimistic && status === optimistic) setOptimistic(null);
  }, [optimistic, status]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setMenuBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 148) });
    }
    place();
    function onPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
    }
    function onReflow() {
      place();
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const option = menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    option?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function stopCardOpen(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  async function choose(next: string) {
    if (pendingRef.current || next === shown) return;
    const previous = shown;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setOpen(false);
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
        setActiveIndex(event.key === "ArrowUp" ? Math.max(moves.length - 1, 0) : 0);
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
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
    if (event.key === "Tab") setOpen(false);
  }

  const menu =
    open && menuBox
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={label}
            data-workbench-status-menu=""
            className="workbench-status-menu"
            style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
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
        aria-busy={pending}
        disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pendingRef.current) return;
          setOpen((value) => !value);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
      >
        {labelForLoadStatus(shown)}
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
