export function LoadConfirmationLink({
  loadId,
  loadNumber,
  variant = "dispatcher",
}: {
  loadId: number;
  loadNumber: string;
  variant?: "dispatcher" | "driver";
}) {
  const className = variant === "driver" ? "btn btn-primary" : "btn btn-secondary";
  return (
    <a className={className} href={`/api/loads/${loadId}/confirmation`}>
      {variant === "driver" ? "Download load confirmation" : `Download ${loadNumber} confirmation`}
    </a>
  );
}
