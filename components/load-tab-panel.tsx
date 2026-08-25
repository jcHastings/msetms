"use client";

import { useLoadEdit } from "@/components/load-edit-context";
import type { LoadTab } from "@/lib/load-tabs";

export function LoadTabPanel({
  when,
  children,
  keepMounted = false,
}: {
  when: LoadTab | LoadTab[];
  children: React.ReactNode;
  keepMounted?: boolean;
}) {
  const edit = useLoadEdit();
  const tab = edit?.tab ?? "basics";
  const visible = Array.isArray(when) ? when.includes(tab) : tab === when;
  if (!visible && !keepMounted) return null;
  return <div hidden={!visible}>{children}</div>;
}
