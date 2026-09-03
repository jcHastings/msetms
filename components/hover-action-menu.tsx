"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDismissable } from "@/components/use-dismissable";
import { createHoverMenuCloser } from "@/lib/hover-menu";

export { HOVER_MENU_CLOSE_DELAY_MS } from "@/lib/hover-menu";

export function HoverActionMenu({
  label,
  children,
  align = "left",
  triggerClassName = "btn load-action-btn",
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closer = useMemo(() => createHoverMenuCloser(), []);
  useDismissable(open, () => setOpen(false), rootRef, menuRef);
  useEffect(() => () => closer.dispose(), [closer]);

  return (
    <div
      ref={rootRef}
      className="relative"
      data-hover-action-menu=""
      onMouseEnter={() => {
        closer.cancel();
        setOpen(true);
      }}
      onMouseLeave={() => closer.schedule(() => setOpen(false))}
    >
      <button
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          closer.cancel();
          setOpen((current) => !current);
        }}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={menuRef}
          className={`absolute z-20 min-w-56 pt-1 ${align === "right" ? "right-0 top-full" : "left-0 top-full"}`}
          role="menu"
          onMouseEnter={() => closer.cancel()}
          onMouseLeave={() => closer.schedule(() => setOpen(false))}
        >
          <div className="absolute inset-x-0 -top-2 h-2" aria-hidden data-hover-menu-bridge="" />
          <div className="load-action-menu rounded-lg py-1 shadow-lg">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
