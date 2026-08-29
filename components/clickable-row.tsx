"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { shouldIgnoreRowClick } from "@/components/use-dismissable";

export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className={`cursor-pointer ${className ?? ""}`}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, summary, input, select, textarea, label, form, details")) return;
        if (shouldIgnoreRowClick()) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
