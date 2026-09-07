import Link from "next/link";

export function SettingsBack() {
  return (
    <p className="mb-4 text-sm">
      <Link href="/settings" className="text-slate-600 underline">
        All settings
      </Link>
    </p>
  );
}
