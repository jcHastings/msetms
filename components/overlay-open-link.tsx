"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoadOverlayFallback } from "@/components/load-overlay-fallback";

export function OverlayOpenLink({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <Link
        href={href}
        className={className}
        title={title}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
            return;
          }
          event.preventDefault();
          start(() => {
            router.push(href);
          });
        }}
      >
        {children}
      </Link>
      {pending && mounted
        ? createPortal(<LoadOverlayFallback label="Opening load" />, document.body)
        : null}
    </>
  );
}
