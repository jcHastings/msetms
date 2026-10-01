"use client";

export default function QuickbooksAccountingError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const recover = retry ?? reset;
  return (
    <section className="card space-y-3 p-5" data-qbo-error="">
      <h1 className="text-sm font-semibold">QuickBooks could not load</h1>
      <p className="text-sm text-slate-600">
        The QuickBooks page hit an error. Connection settings were not changed.
      </p>
      {error.message.trim() ? <p className="text-sm text-rose-800">{error.message}</p> : null}
      {recover ? (
        <button className="btn btn-primary" type="button" onClick={() => recover()}>
          Try again
        </button>
      ) : null}
    </section>
  );
}
