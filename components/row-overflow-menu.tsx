"use client";

import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { claimOverflowMenu, useDismissable } from "@/components/use-dismissable";

function stopRowNav(event: SyntheticEvent) {
  event.stopPropagation();
}

export function RowOverflowMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useDismissable(open, () => setOpen(false), rootRef, menuRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    return claimOverflowMenu(() => setOpen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" onClick={stopRowNav} onPointerDown={stopRowNav}>
      <button
        ref={buttonRef}
        type="button"
        className="row-actions-btn cursor-pointer"
        aria-label={`More actions for ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        data-row-overflow-trigger=""
        onClick={() => setOpen((current) => !current)}
      >
        ⋯
      </button>
      {open && mounted && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="load-action-menu fixed z-50 min-w-52 py-1 shadow-lg"
              role="menu"
              data-row-overflow-menu=""
              style={{ top: menuPos.top, right: menuPos.right, borderRadius: "var(--r-xs)" }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
