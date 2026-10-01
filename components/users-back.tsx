import Link from "next/link";

export function UsersBack() {
  return (
    <p className="mb-4 text-sm">
      <Link href="/users" className="text-slate-600 underline">
        All users
      </Link>
    </p>
  );
}
