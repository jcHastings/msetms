"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useDocumentPreview } from "@/components/document-preview";
import { attachmentIdFromHref } from "@/lib/load-documents-shared";
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
  const preview = useDocumentPreview();
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
        const attachmentId = attachmentIdFromHref(href);
        if (preview && attachmentId) {
          const title = typeof children === "string" ? children : "Document";
          preview.openPreview({ attachmentId, title });
          return;
        }
        void openPdfInNewTab(href, event);
      }}
    >
      {children}
    </button>
  );
}
