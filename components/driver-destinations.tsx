import Link from "next/link";

export type DriverDestination = {
  href: string;
  label: string;
  disabled?: boolean;
};

export function DriverDestinations({ items }: { items: DriverDestination[] }) {
  return (
    <nav className="mb-5 grid grid-cols-2 gap-3" data-driver-destinations="">
      {items.map((item) =>
        item.disabled ? (
          <span
            key={item.label}
            className="rounded-2xl bg-slate-100 px-4 py-5 text-center text-base font-semibold text-slate-400"
          >
            {item.label}
          </span>
        ) : (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-2xl bg-white px-4 py-5 text-center text-base font-semibold text-slate-900 shadow-sm"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
