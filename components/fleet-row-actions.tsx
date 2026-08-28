"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { claimOverflowMenu, useDismissable } from "@/components/use-dismissable";
import {
  deleteDriverAction,
  deleteTrailerAction,
  deleteTruckAction,
  toggleDriverActiveAction,
  toggleTrailerActiveAction,
  toggleTruckActiveAction,
} from "@/lib/actions";
import { FLEET_ASSIGNED_DELETE_HINT, type FleetRowKind } from "@/lib/fleet-row-shared";
import type { ActionResult } from "@/lib/types";

function stopRowNav(event: SyntheticEvent) {
  event.stopPropagation();
}

function deleteActionFor(kind: FleetRowKind) {
  if (kind === "truck") return deleteTruckAction;
  if (kind === "driver") return deleteDriverAction;
  return deleteTrailerAction;
}

function toggleActionFor(kind: FleetRowKind) {
  if (kind === "truck") return toggleTruckActiveAction;
  if (kind === "driver") return toggleDriverActiveAction;
  return toggleTrailerActiveAction;
}

export function FleetRowActions({
  kind,
  id,
  href,
  active,
  assigned,
  canDelete,
  label,
}: {
  kind: FleetRowKind;
  id: number;
  href: string;
  active: boolean;
  assigned: boolean;
  canDelete: boolean;
  label: string;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleActionFor(kind), null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteActionFor(kind), null);
  const error =
    (toggleState && !toggleState.ok ? toggleState.error : null) ??
    (deleteState && !deleteState.ok ? deleteState.error : null);
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
        aria-label={`Actions for ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        ⋯
      </button>
      {open && mounted && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="load-action-menu fixed z-50 min-w-52 rounded-lg py-1 shadow-lg"
              role="menu"
              data-row-overflow-menu=""
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <Link href={href} className="menu-item block">
                Edit
              </Link>
              <Link href={href} className="menu-item block">
                Update
              </Link>
              <form action={toggleAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="active" value={active ? "0" : "1"} />
                <button type="submit" className="menu-item w-full text-left" disabled={togglePending}>
                  {active ? "Inactive" : "Active"}
                </button>
              </form>
              {canDelete ? (
                assigned ? (
                  <>
                    <button type="button" className="menu-item w-full text-left opacity-50" disabled>
                      Delete
                    </button>
                    <p className="px-3 py-2 text-xs text-slate-600">{FLEET_ASSIGNED_DELETE_HINT}</p>
                  </>
                ) : (
                  <form
                    action={deleteAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={id} />
                    <button type="submit" className="menu-item w-full text-left text-red-800" disabled={deletePending}>
                      Delete
                    </button>
                  </form>
                )
              ) : null}
              {error ? <p className="px-3 py-2 text-xs text-red-700">{error}</p> : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export type { ActionResult };
