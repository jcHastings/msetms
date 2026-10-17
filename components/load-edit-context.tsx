"use client";

import { createContext, useContext } from "react";
import type { LoadTab } from "@/lib/load-tabs";

export type LoadEditContextValue = {
  tab: LoadTab;
  setTab: (tab: LoadTab, hash?: string) => void;
  dirty: boolean;
  markDirty: () => void;
  clearDirty: () => void;
  formId: string;
  canSubmit: boolean;
  pending: boolean;
  setSubmitState: (state: { canSubmit: boolean; pending: boolean }) => void;
};

const LoadEditContext = createContext<LoadEditContextValue | null>(null);

export function LoadEditProvider({
  value,
  children,
}: {
  value: LoadEditContextValue;
  children: React.ReactNode;
}) {
  return <LoadEditContext.Provider value={value}>{children}</LoadEditContext.Provider>;
}

export function useLoadEdit(): LoadEditContextValue | null {
  return useContext(LoadEditContext);
}
