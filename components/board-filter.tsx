"use client";

import { createContext, useContext, useMemo, useState, type ReactNode, type TdHTMLAttributes } from "react";

type BoardFilterValue = {
  q: string;
  setQ: (value: string) => void;
};

const BoardFilterContext = createContext<BoardFilterValue>({ q: "", setQ: () => undefined });

export function BoardFilterProvider({ children }: { children: ReactNode }) {
  const [q, setQ] = useState("");
  const value = useMemo(() => ({ q, setQ }), [q]);
  return <BoardFilterContext.Provider value={value}>{children}</BoardFilterContext.Provider>;
}

export function useBoardFilter(): BoardFilterValue {
  return useContext(BoardFilterContext);
}

export function BoardFilterRow({
  haystack,
  className,
  children,
  ...rest
}: {
  haystack: string;
  className?: string;
  children: ReactNode;
} & TdHTMLAttributes<HTMLTableRowElement>) {
  const { q } = useBoardFilter();
  const term = q.trim().toLowerCase();
  const hide = Boolean(term) && !haystack.toLowerCase().includes(term);
  if (hide) return null;
  return (
    <tr className={className} data-load-search={haystack.toLowerCase()} {...rest}>
      {children}
    </tr>
  );
}
