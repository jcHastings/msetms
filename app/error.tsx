"use client";

export default function AppError({
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
    <section className="card space-y-3 p-5" data-app-error="">
      <h1 className="text-sm font-semibold">This page could not load</h1>
      <p className="text-sm text-slate-600">Try again, or open another page from the sidebar.</p>
      {error.message.trim() ? <p className="text-sm text-rose-800">{error.message}</p> : null}
      {recover ? (
        <button className="btn btn-primary" type="button" onClick={() => recover()}>
          Try again
        </button>
      ) : null}
    </section>
  );
}
