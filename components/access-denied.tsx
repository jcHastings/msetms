export function AccessDenied({ message }: { message?: string }) {
  return (
    <section className="card p-6">
      <h1 className="text-xl font-semibold">You do not have access</h1>
      <p className="mt-2 text-sm text-slate-600">
        {message ?? "This area is not available for your role."}
      </p>
    </section>
  );
}
