"use client";

import { useEffect } from "react";

export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    const next = title.includes("MS Express TMS") ? title : `${title} · MS Express TMS`;
    document.title = next;
  }, [title]);
  return null;
}
