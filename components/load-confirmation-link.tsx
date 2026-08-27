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
  const className = variant === "driver" ? "btn btn-primary" : "btn btn-secondary";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        className={className}
        href={
          variant === "driver"
            ? `/api/loads/${loadId}/confirmation?packet=internal`
            : `/api/loads/${loadId}/confirmation`
        }
      >
        {variant === "driver" ? "Download load confirmation" : `Download ${loadNumber} confirmation`}
      </a>
      {variant === "dispatcher" && hasRelays ? (
        <a className="btn btn-secondary" href={`/api/loads/${loadId}/confirmation?packet=internal`}>
          Driver packet (internal)
        </a>
      ) : null}
    </div>
  );
}
