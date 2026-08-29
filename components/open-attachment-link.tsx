"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { downloadWithoutLeaving, openPdfInNewTab } from "@/lib/open-generated-pdf";

export function OpenAttachmentLink({
  href,
  className,
  children,
  download = false,
  onClick,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
  download?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return (
    <button
      type="button"
      className={className}
      {...rest}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.(event);
        if (download) {
          downloadWithoutLeaving(href);
          return;
        }
        void openPdfInNewTab(href, event);
      }}
    >
      {children}
    </button>
  );
}
