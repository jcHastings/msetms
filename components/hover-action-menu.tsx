"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "@/components/use-dismissable";
import { createHoverMenuCloser } from "@/lib/hover-menu";

export { HOVER_MENU_CLOSE_DELAY_MS } from "@/lib/hover-menu";

export function HoverActionMenu({
  label,
  ariaLabel,
  children,
  align = "left",
  triggerClassName = "btn load-action-btn",
  sheetOnPhone = false,
}: {
  label: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  align?: "left" | "right";
  triggerClassName?: string;
  sheetOnPhone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closer = useMemo(() => createHoverMenuCloser(), []);
  useDismissable(open, () => setOpen(false), rootRef, menuRef);
  useEffect(() => () => closer.dispose(), [closer]);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!sheetOnPhone) return;
    const media = window.matchMedia("(max-width: 390px)");
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [sheetOnPhone]);

  const useSheet = sheetOnPhone && phone;
  const menu = open ? (
    <div
      ref={menuRef}
      className={
        useSheet
          ? "action-phone-sheet"
          : `absolute z-20 min-w-56 pt-1 ${align === "right" ? "right-0 top-full" : "left-0 top-full"}`
      }
      role="menu"
      data-action-phone-sheet={useSheet ? "" : undefined}
      onClick={() => {
        if (useSheet) setOpen(false);
      }}
      onMouseEnter={() => closer.cancel()}
      onMouseLeave={() => {
        if (!useSheet) closer.schedule(() => setOpen(false));
      }}
    >
      {useSheet ? <div className="action-phone-grab" aria-hidden="true" /> : <div className="absolute inset-x-0 -top-2 h-2" aria-hidden data-hover-menu-bridge="" />}
      <div className="load-action-menu rounded-lg py-1 shadow-lg">{children}</div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="relative"
      data-hover-action-menu=""
      onMouseEnter={() => {
        if (useSheet) return;
        closer.cancel();
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (useSheet) return;
        closer.schedule(() => setOpen(false));
      }}
    >
      <button
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          closer.cancel();
          setOpen((current) => !current);
        }}
      >
        {label}
      </button>
      {useSheet && mounted && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
