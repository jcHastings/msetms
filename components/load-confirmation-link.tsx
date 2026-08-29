"use client";

import { useLoadEdit } from "@/components/load-edit-context";
import { confirmationPacketForTab } from "@/lib/load-tabs";

export function LoadConfirmationLink({
  loadId,
  loadNumber,
  variant = "dispatcher",
  hasRelays = false,
}: {
  loadId: number;
  loadNumber: string;
  variant?: "dispatcher" | "driver";
  hasRelays?: boolean;
}) {
  const tab = useLoadEdit()?.tab ?? "basics";
  const packet = variant === "driver" ? "internal" : confirmationPacketForTab(tab);
  const href =
    packet === "internal"
      ? `/api/loads/${loadId}/confirmation?packet=internal`
      : `/api/loads/${loadId}/confirmation`;
  const className = variant === "driver" ? "btn btn-primary" : "btn btn-secondary";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className={className} href={href} data-confirmation-packet={packet} data-load-confirmation-tab={tab}>
        {variant === "driver" ? "Download load confirmation" : `Download ${loadNumber} confirmation`}
      </a>
      {variant === "dispatcher" && hasRelays && packet !== "internal" ? (
        <a className="btn btn-secondary" href={`/api/loads/${loadId}/confirmation?packet=internal`}>
          Driver packet (internal)
        </a>
      ) : null}
    </div>
  );
}
