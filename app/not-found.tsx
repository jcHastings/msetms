import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card max-w-lg p-8">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-slate-500">That record is not in the local TMS database.</p>
      <Link href="/" className="btn btn-primary mt-5">
        Back to dashboard
      </Link>
    </div>
  );
}
