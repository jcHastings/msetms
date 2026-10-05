"use client";

import { useEffect, useState, type ReactNode } from "react";
import { parseOpenLoadId } from "@/lib/load-page-shared";

export function LoadOverlayFrame({
  loadId,
  children,
}: {
  loadId: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const sync = () => {
      const current = parseOpenLoadId(new URL(window.location.href).searchParams.get("open") ?? undefined);
      setOpen(current === loadId);
    };
    sync();
    window.addEventListener("ms-open-load", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("ms-open-load", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [loadId]);

  if (!open) return null;
  return <>{children}</>;
}
