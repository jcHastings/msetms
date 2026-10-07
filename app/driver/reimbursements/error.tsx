"use client";

export default function DriverReimbursementsError({
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
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <section className="driver-sheet rounded-2xl bg-white p-4" data-driver-reimbursements-error="">
        <h1 className="text-base font-semibold">Reimbursements could not load</h1>
        <p className="mt-1 text-sm text-slate-600">Nothing was submitted or changed.</p>
        {error.message.trim() ? <p className="mt-2 text-sm text-rose-800">{error.message}</p> : null}
        {recover ? (
          <button className="btn btn-primary hit-target mt-3" type="button" onClick={() => recover()}>
            Try again
          </button>
        ) : null}
      </section>
    </div>
  );
}
