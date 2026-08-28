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
          <span key={item.label} className="driver-dest-off">
            {item.label}
          </span>
        ) : (
          <Link key={item.label} href={item.href} className="driver-dest">
            <span className="driver-dest-label">{item.label}</span>
          </Link>
        ),
      )}
    </nav>
  );
}
