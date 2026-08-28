"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

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
      {pending ? (
        <div className="load-overlay-backdrop" role="status" aria-live="polite" aria-label="Opening load">
          <div className="load-overlay-panel px-5 py-6 text-sm text-slate-700">Opening…</div>
        </div>
      ) : null}
    </>
  );
}
